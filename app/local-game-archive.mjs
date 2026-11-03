export const maxArchiveSize = 128 * 1024 * 1024;
export const maxExpandedSize = 256 * 1024 * 1024;
export const maxLocalGameSize = 4 * 1024 * 1024 * 1024;
export const maxGameEntries = 8192;

const localZipLimits = { archiveLimit: maxLocalGameSize, expandedLimit: maxLocalGameSize };

class ArchiveError extends Error {}

// Hand the ZIP loader to the player route through this tab's memory.
let selectedArchive;

export function selectGameArchive(loadArchive, game) {
  selectedArchive = { loadArchive, game };
}

export function getSelectedGamePresentation() {
  return selectedArchive?.game ?? null;
}

export async function openSelectedGameArchive(signal) {
  // Let React cancel any superseded effect before taking the selection.
  await Promise.resolve();
  signal.throwIfAborted();
  const archive = selectedArchive;
  selectedArchive = undefined;
  if (!archive) {
    throw new ArchiveError("Choose a game from the Library to play it here.");
  }
  return archive.loadArchive(signal);
}

export function validateGameZip(file, archiveLimit = maxArchiveSize) {
  if (!file.name.toLowerCase().endsWith(".zip")) {
    throw new ArchiveError("Choose a ZIP containing one ScummVM game.");
  }
  if (file.size > archiveLimit) {
    throw new ArchiveError(`Choose a ZIP of ${archiveLimit / (1024 * 1024)} MiB or less.`);
  }
}

async function withZipEntries(file, useEntries, { archiveLimit = maxArchiveSize, expandedLimit = maxExpandedSize } = {}) {
  validateGameZip(file, archiveLimit);
  const { BlobReader, ERR_UNSAFE_FILENAME, ZipReader } = await import("@zip.js/zip.js");
  const reader = new ZipReader(new BlobReader(file));
  try {
    const entries = new Map();
    let entryCount = 0;
    let totalSize = 0;
    for await (const entry of reader.getEntriesGenerator()) {
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

function gamePathParts(path) {
  const parts = path.split("/");
  if (
    path.length > 1024 ||
    /[\x00-\x1f\x7f:\\]/.test(path) ||
    parts.some((part) => !part || part === "." || part === ".." || part === "__proto__")
  ) {
    throw new ArchiveError("This game contains an invalid file path.");
  }
  return parts;
}

function gameEntries(entries) {
  if (!entries.size) throw new ArchiveError("This game does not contain any game files.");
  const files = [...entries.values()];
  let prefixLength = 0;
  while (files.every(({ parts }) =>
    parts.length > prefixLength + 1 && parts[prefixLength] === files[0].parts[prefixLength]
  )) {
    prefixLength++;
  }
  for (const { parts } of files) {
    for (let depth = 1; depth < parts.length; depth++) {
      if (entries.has(parts.slice(0, depth).join("/").toLowerCase())) {
        throw new ArchiveError("This game uses the same path for a file and folder.");
      }
    }
  }
  const resolved = files.map(({ parts, ...item }) => ({ ...item, path: parts.slice(prefixLength).join("/") }));
  const paths = resolved.map(({ path }) => path.toLowerCase());
  if (paths.includes("dott.exe") && paths.every((path) => path === "dott.exe" || path === "bootdisk.exe")) {
    throw new ArchiveError("This game is missing Day of the Tentacle game data. Include TENTACLE.000 and TENTACLE.001 from the original DOS game.");
  }
  return resolved;
}

export function scanLocalGameArchive(file) {
  return withZipEntries(file, (entries, totalSize) => {
    if (requiresFileBackedZip(file, totalSize)) validateStoredEntries(entries);
  }, localZipLimits);
}

export function readLocalGameArchive(file, { signal, ...limits } = {}) {
  return withZipEntries(file, (entries) => unpackGameEntries(entries, signal), limits);
}

function requiresFileBackedZip(file, totalSize) {
  return file.size > maxArchiveSize || totalSize > maxExpandedSize;
}

function validateStoredEntries(entries) {
  if (entries.some(({ entry }) => entry.compressionMethod !== 0 ||
      entry.compressedSize !== entry.uncompressedSize)) {
    throw new ArchiveError("For a large game, use a ZIP created without compression or drop its unpacked folder.");
  }
}

export function openLocalGameZip(file, signal) {
  return withZipEntries(file, async (entries, totalSize) => {
    if (!requiresFileBackedZip(file, totalSize)) return unpackGameEntries(entries, signal);
    validateStoredEntries(entries);
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
  }, localZipLimits);
}

async function unpackGameEntries(entries, signal) {
  const files = [];
  for (const { entry, path } of entries) {
    signal?.throwIfAborted();
    const data = new Uint8Array(entry.uncompressedSize);
    let offset = 0;
    try {
      await entry.getData(new WritableStream({
        write(chunk) {
          signal?.throwIfAborted();
          data.set(chunk, offset);
          offset += chunk.length;
        },
      }), { checkSignature: true, useWebWorkers: false });
      if (offset !== data.length) throw new Error("Unexpected file size");
    } catch {
      signal?.throwIfAborted();
      throw new ArchiveError("A game file could not be unpacked. Check that the ZIP is intact.");
    }
    files.push({ path, data });
  }
  return files;
}

export function validateGameFolder(files) {
  const entries = new Map();
  let size = 0;
  for (const { file, path } of files) {
    const parts = gamePathParts(path);
    const key = path.toLowerCase();
    if (entries.has(key)) throw new ArchiveError("This game folder contains duplicate file paths.");
    entries.set(key, { parts, file });
    size += file.size;
    if (size > maxLocalGameSize) throw new ArchiveError("Choose a game folder of 4 GiB or less.");
    if (entries.size > maxGameEntries) throw new ArchiveError("This game folder contains too many files.");
  }
  return gameEntries(entries);
}

export async function readGameFolder(files) {
  const entries = validateGameFolder(files);
  if (entries.reduce((size, { file }) => size + file.size, 0) > maxExpandedSize) {
    return entries.map(({ path, file }) => ({ path, blob: file }));
  }
  const result = [];
  for (const { file, path } of entries) {
    result.push({ path, data: new Uint8Array(await file.arrayBuffer()) });
  }
  return result;
}
