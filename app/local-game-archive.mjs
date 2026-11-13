import { ArchiveError, maxArchiveSize, maxExpandedSize, maxGameEntries, maxLocalGameSize, validateGameZip, validateLocalGameArchive } from "./local-game-selection.mjs";

export * from "./local-game-selection.mjs";

import { gameEntries, gamePathParts } from "./game-file-entries.mjs";

const localZipLimits = { archiveLimit: maxLocalGameSize, expandedLimit: maxLocalGameSize };

async function withZipEntries(file, useEntries, { archiveLimit = maxArchiveSize, expandedLimit = maxExpandedSize, signal } = {}) {
  validateGameZip(file, archiveLimit);
  const { BlobReader } = await import("@zip.js/zip.js");
  return withGameZipEntries(new BlobReader(file), useEntries, { expandedLimit, signal });
}

async function withGameZipEntries(source, useEntries, { expandedLimit = maxExpandedSize, signal } = {}) {
  const { ERR_UNSAFE_FILENAME, ZipReader } = await import("@zip.js/zip.js");
  const reader = new ZipReader(source);
  try {
    const entries = new Map();
    let entryCount = 0;
    let totalSize = 0;
    for await (const entry of reader.getEntriesGenerator()) {
      signal?.throwIfAborted();
      if (++entryCount > maxGameEntries) {
        throw new ArchiveError("This ZIP contains too many entries.");
      }
      if (entry.directory) continue;

      const path = entry.filename.replaceAll("\\", "/");
      const parts = gamePathParts(path);
      if (parts[0] === "__MACOSX" || parts.at(-1) === ".DS_Store") continue;
      if (entry.encrypted) {
        throw new ArchiveError("Password-protected ZIPs cannot be opened.");
      }
      if (entry.symlink) throw new ArchiveError("Game ZIPs cannot contain symbolic links.");

      totalSize += entry.uncompressedSize;
      if (!Number.isSafeInteger(totalSize) || totalSize > expandedLimit) {
        throw new ArchiveError(`This ZIP exceeds ${expandedLimit / (1024 * 1024)} MiB when unpacked.`);
      }
      const key = path.toLowerCase();
      if (entries.has(key)) {
        throw new ArchiveError("This ZIP contains duplicate file paths.");
      }
      entries.set(key, { entry, parts });
    }
    return await useEntries(gameEntries(entries), totalSize);
  } catch (error) {
    if (error instanceof ArchiveError || error?.name === "AbortError") throw error;
    if (error.message === ERR_UNSAFE_FILENAME) {
      throw new ArchiveError("This ZIP contains an invalid file path.");
    }
    throw new ArchiveError("This file is not a readable ZIP.");
  } finally {
    await reader.close();
  }
}

// Inspect a seekable ZIP without extracting any game data.
export function scanGameZipReader(reader, options) {
  return withGameZipEntries(reader, (entries) =>
    entries.map(({ path, entry }) => [path, entry.uncompressedSize, entry.signature]), options);
}

export async function scanLocalGameArchive(file) {
  validateLocalGameArchive(file);
  if (/\.iso$/i.test(file.name)) {
    const { scanGameIso } = await import("./local-game-iso.mjs");
    return scanGameIso(file);
  }
  return withZipEntries(file, (entries) => entries.map(({ path, entry }) =>
    [path, entry.uncompressedSize, entry.signature]), localZipLimits);
}

export async function readLocalGameArchive(file, options = {}) {
  if (/\.iso$/i.test(file.name)) {
    const { openGameIso } = await import("./local-game-iso.mjs");
    return openGameIso(file, options);
  }
  return withZipEntries(file, extractGameFiles(options), options);
}

export async function readGameArchiveBytes(bytes, { archiveLimit = maxArchiveSize, ...options } = {}) {
  if (bytes.byteLength > archiveLimit) {
    throw new ArchiveError(`This ZIP exceeds ${archiveLimit / (1024 * 1024)} MiB download limit.`);
  }
  const { Uint8ArrayReader } = await import("@zip.js/zip.js");
  return withGameZipEntries(new Uint8ArrayReader(bytes), extractGameFiles(options), options);
}

function extractGameFiles({ signal, onEntries }) {
  return (entries) => {
    signal?.throwIfAborted();
    onEntries?.(entries.map(({ path, entry }) => [path, entry.uncompressedSize, entry.signature]));
    return unpackGameEntries(entries, signal);
  };
}

// The manifest describes already-verified bytes, not executable paths or ZIP
// entries. Recheck the current limits and path rules before exposing slices.
export function openPreparedGameArchive(archive, manifest, {
  signal, onEntries, archiveLimit = maxArchiveSize, expandedLimit = maxExpandedSize,
} = {}) {
  signal?.throwIfAborted();
  if (!Number.isSafeInteger(manifest.archiveSize) || manifest.archiveSize < 0 ||
      !Array.isArray(manifest.entries) || manifest.entries.length > maxGameEntries) {
    throw new ArchiveError("The cached game installation is invalid.");
  }
  if (manifest.archiveSize > archiveLimit) {
    throw new ArchiveError(`This ZIP exceeds the ${archiveLimit / (1024 * 1024)} MiB download limit.`);
  }
  const entries = new Map();
  let total = 0;
  for (const item of manifest.entries) {
    if (!Array.isArray(item) || item.length !== 3) throw new ArchiveError("The cached game installation is invalid.");
    const [path, size, signature] = item;
    if (typeof path !== "string" || !Number.isSafeInteger(size) || size < 0 ||
        !Number.isInteger(signature) || signature < 0 || signature > 0xffffffff) {
      throw new ArchiveError("The cached game installation is invalid.");
    }
    const parts = gamePathParts(path);
    const key = path.toLowerCase();
    if (entries.has(key)) throw new ArchiveError("This ZIP contains duplicate file paths.");
    entries.set(key, { parts, entry: { uncompressedSize: size, signature }, offset: total });
    total += size;
    if (!Number.isSafeInteger(total) || total > expandedLimit) {
      throw new ArchiveError(`This ZIP exceeds ${expandedLimit / (1024 * 1024)} MiB when unpacked.`);
    }
  }
  if (total !== archive.size) throw new ArchiveError("The cached game installation is incomplete.");
  const files = gameEntries(entries).map(({ path, entry, offset }) => ({
    path, blob: archive.slice(offset, offset + entry.uncompressedSize),
  }));
  onEntries?.(manifest.entries);
  return files;
}

function requiresFileBackedZip(file, totalSize) {
  return file.size > maxArchiveSize || totalSize > maxExpandedSize;
}

export async function openLocalGameArchive(file, signal, onProgress) {
  if (/\.iso$/i.test(file.name)) {
    const { openGameIso } = await import("./local-game-iso.mjs");
    return openGameIso(file, { signal });
  }
  return openLocalGameZip(file, signal, onProgress);
}

export function openLocalGameZip(file, signal, onProgress) {
  return withZipEntries(file, async (entries, totalSize) => {
    if (!requiresFileBackedZip(file, totalSize)) return unpackGameEntries(entries, signal);
    if (entries.some(({ entry }) => entry.compressionMethod !== 0 ||
        entry.compressedSize !== entry.uncompressedSize)) {
      return unpackGameEntriesToBlob(entries, totalSize, signal, onProgress);
    }
    const files = [];
    for (const { entry, path } of entries) {
      signal?.throwIfAborted();
      // A stored ZIP member starts after the fixed local header, name and extra
      // fields. Its Blob slice keeps the original file backing until read.
      const headerSize = 30;
      if (!Number.isSafeInteger(entry.offset) || entry.offset < 0) {
        throw new ArchiveError("A game file has an invalid ZIP entry.");
      }
      const header = new DataView(await file.slice(entry.offset, entry.offset + headerSize).arrayBuffer());
      if (header.byteLength !== headerSize || header.getUint32(0, true) !== 0x04034b50 ||
          (header.getUint16(6, true) & 1) || header.getUint16(8, true) !== 0) {
        throw new ArchiveError("A game file has an invalid ZIP header.");
      }
      const nameLength = header.getUint16(26, true);
      const nameStart = entry.offset + headerSize;
      const name = new Uint8Array(await file.slice(nameStart, nameStart + nameLength).arrayBuffer());
      const start = nameStart + nameLength + header.getUint16(28, true);
      const end = start + entry.uncompressedSize;
      if (name.length !== entry.rawFilename.length || name.some((byte, i) => byte !== entry.rawFilename[i]) ||
          !Number.isSafeInteger(end) || end > file.size) {
        throw new ArchiveError("A game file has an invalid ZIP entry.");
      }
      files.push({ path, blob: file.slice(start, end) });
    }
    return files;
  }, { ...localZipLimits, signal });
}

async function unpackGameEntries(entries, signal) {
  const files = [];
  for (const { entry, path } of entries) {
    signal?.throwIfAborted();
    const data = new Uint8Array(entry.uncompressedSize);
    let offset = 0;
    await writeGameEntry(entry, signal, (chunk) => {
      data.set(chunk, offset);
      offset += chunk.length;
    });
    files.push({ path, data });
  }
  return files;
}


async function writeGameEntry(entry, signal, write) {
  let size = 0;
  try {
    signal?.throwIfAborted();
    await entry.getData(new WritableStream({
      write(chunk) {
        signal?.throwIfAborted();
        size += chunk.length;
        if (size > entry.uncompressedSize) throw new Error("Unexpected file size");
        return write(chunk);
      },
    }), { signal, checkSignature: true, useWebWorkers: false });
    if (size !== entry.uncompressedSize) throw new Error("Unexpected file size");
  } catch (error) {
    signal?.throwIfAborted();
    if (error instanceof ArchiveError) throw error;
    throw new ArchiveError("A game file could not be unpacked. Check that the ZIP is intact.", { cause: error });
  }
}

async function writeGameBundle(entries, totalSize, signal, onProgress, writable) {
  const writer = writable.getWriter();
  let loaded = 0;
  let percent = 0;
  try {
    onProgress?.(0, { loaded, total: totalSize });
    for (const { entry } of entries) {
      await writeGameEntry(entry, signal, async (chunk) => {
        try {
          await writer.write(chunk);
        } catch (error) {
          throw new ArchiveError("Could not prepare the game ZIP in browser storage.", { cause: error });
        }
        loaded += chunk.length;
        const next = totalSize ? Math.floor(loaded / totalSize * 100) : 100;
        if (next === percent) return;
        percent = next;
        onProgress?.(percent, { loaded, total: totalSize });
      });
    }
    await writer.close();
  } catch (error) {
    await writer.abort(error).catch(() => {});
    throw error;
  }
}

function prepareGameBundleOnDisk(entries, totalSize, signal, onProgress) {
  const { locks, storage } = globalThis.navigator ?? {};
  if (!signal || !locks?.request || !storage?.getDirectory ||
      !globalThis.FileSystemFileHandle?.prototype?.createWritable) return null;
  const filename = "unpacked.bin";
  return new Promise((resolve, reject) => {
    // The lock spans the game session, because the iframe reads these file
    // slices lazily. A closed page releases the lock, so the next launch
    // can remove an orphan before creating a new file.
    locks.request("scummweb-local-game-archive", { ifAvailable: true }, async (lock) => {
      if (!lock) throw new ArchiveError("Another large game is open. Close it before starting this game.");
      signal.throwIfAborted();
      const root = await storage.getDirectory();
      const directory = await root.getDirectoryHandle("scummweb-local-game", { create: true });
      try {
        await directory.removeEntry(filename);
      } catch (error) {
        if (error.name !== "NotFoundError") throw error;
      }
      signal.throwIfAborted();
      try {
        const handle = await directory.getFileHandle(filename, { create: true });
        await writeGameBundle(entries, totalSize, signal, onProgress, await handle.createWritable());
        signal.throwIfAborted();
        resolve(await handle.getFile());
        if (!signal.aborted) {
          await new Promise((finished) => signal.addEventListener("abort", finished, { once: true }));
        }
      } finally {
        await directory.removeEntry(filename).catch(() => {});
      }
    }).catch((error) => {
      if (signal.aborted) return reject(signal.reason);
      reject(error instanceof ArchiveError ? error :
        new ArchiveError("Could not prepare the game ZIP in browser storage.", { cause: error }));
    });
  });
}

async function prepareGameBundleInBlob(entries, totalSize, signal, onProgress) {
  const { readable, writable } = new TransformStream();
  const [prepared, written] = await Promise.allSettled([
    new Response(readable).blob(),
    writeGameBundle(entries, totalSize, signal, onProgress, writable),
  ]);
  signal?.throwIfAborted();
  if (written.status === "rejected") throw written.reason;
  if (prepared.status === "rejected") {
    throw new ArchiveError("Could not prepare the game ZIP in browser storage.", { cause: prepared.reason });
  }
  return prepared.value;
}

async function unpackGameEntriesToBlob(entries, totalSize, signal, onProgress) {
  const bundle = await (prepareGameBundleOnDisk(entries, totalSize, signal, onProgress)
    ?? prepareGameBundleInBlob(entries, totalSize, signal, onProgress));
  signal?.throwIfAborted();
  if (bundle.size !== totalSize) throw new ArchiveError("The unpacked game ZIP is incomplete.");
  let offset = 0;
  return entries.map(({ path, entry }) => {
    const start = offset;
    offset += entry.uncompressedSize;
    return { path, blob: bundle.slice(start, offset) };
  });
}
