export const maxArchiveSize = 128 * 1024 * 1024;
export const maxExpandedSize = 256 * 1024 * 1024;
export const maxGameEntries = 4096;

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

export function validateGameZip(file) {
  if (!file.name.toLowerCase().endsWith(".zip")) {
    throw new ArchiveError("Choose a ZIP containing one ScummVM game.");
  }
  if (file.size > maxArchiveSize) {
    throw new ArchiveError("Choose a ZIP of 128 MiB or less.");
  }
}

async function withZipEntries(file, useEntries) {
  validateGameZip(file);
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

      totalSize += entry.uncompressedSize;
      if (!Number.isSafeInteger(totalSize) || totalSize > maxExpandedSize) {
        throw new ArchiveError("This ZIP exceeds 256 MiB when unpacked.");
      }
      const key = path.toLowerCase();
      if (entries.has(key)) {
        throw new ArchiveError("This ZIP contains duplicate file paths.");
      }
      entries.set(key, { entry, parts });
    }
    return await useEntries(gameEntries(entries));
  } catch (error) {
    if (error instanceof ArchiveError) throw error;
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
  return withZipEntries(file, () => {});
}

export function readLocalGameArchive(file) {
  return withZipEntries(file, async (entries) => {
    const files = [];
    for (const { entry, path } of entries) {
      const data = new Uint8Array(entry.uncompressedSize);
      let offset = 0;
      try {
        await entry.getData(new WritableStream({
          write(chunk) {
            data.set(chunk, offset);
            offset += chunk.length;
          },
        }), { checkSignature: true, useWebWorkers: false });
        if (offset !== data.length) throw new Error("Unexpected file size");
      } catch {
        throw new ArchiveError("A game file could not be unpacked. Check that the ZIP is intact.");
      }
      files.push({ path, data });
    }
    return files;
  });
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
    if (size > maxExpandedSize) throw new ArchiveError("Choose a game folder of 256 MiB or less.");
    if (entries.size > maxGameEntries) throw new ArchiveError("This game folder contains too many files.");
  }
  return gameEntries(entries);
}

export async function readGameFolder(files) {
  const result = [];
  for (const { file, path } of validateGameFolder(files)) {
    result.push({ path, data: new Uint8Array(await file.arrayBuffer()) });
  }
  return result;
}
