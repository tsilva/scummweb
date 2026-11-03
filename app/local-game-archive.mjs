export const maxArchiveSize = 128 * 1024 * 1024;
const maxExpandedSize = 256 * 1024 * 1024;
const maxEntries = 4096;

class ArchiveError extends Error {}

// Hand the ZIP loader to the player route through this tab's memory.
let selectedArchive;

export function selectGameArchive(loadArchive) {
  selectedArchive = loadArchive;
}

export async function openSelectedGameArchive(signal) {
  // Let React cancel any superseded effect before taking the selection.
  await Promise.resolve();
  signal.throwIfAborted();
  const loadArchive = selectedArchive;
  selectedArchive = undefined;
  if (!loadArchive) {
    throw new ArchiveError("Choose a game from the Library to play it here.");
  }
  return loadArchive(signal);
}

export function validateGameZip(file) {
  if (!file.name.toLowerCase().endsWith(".zip")) {
    throw new ArchiveError("Choose a ZIP containing one ScummVM game.");
  }
  if (file.size > maxArchiveSize) {
    throw new ArchiveError("Choose a ZIP of 128 MiB or less.");
  }
}

export async function readLocalGameArchive(file) {
  validateGameZip(file);
  const { BlobReader, ERR_UNSAFE_FILENAME, ZipReader } = await import("@zip.js/zip.js");
  const reader = new ZipReader(new BlobReader(file));
  try {
    const entries = new Map();
    let entryCount = 0;
    let totalSize = 0;
    for await (const entry of reader.getEntriesGenerator()) {
      if (++entryCount > maxEntries) {
        throw new ArchiveError("This ZIP contains too many entries.");
      }
      if (entry.directory) continue;

      const path = entry.filename.replaceAll("\\", "/");
      const parts = path.split("/");
      if (
        path.length > 1024 ||
        /[\x00-\x1f\x7f:]/.test(path) ||
        parts.some((part) => !part || part === "." || part === ".." || part === "__proto__")
      ) {
        throw new ArchiveError("This ZIP contains an invalid file path.");
      }
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
    if (entries.size === 0) {
      throw new ArchiveError("This ZIP does not contain any game files.");
    }

    const files = [];
    const allEntries = [...entries.values()];
    // Game downloads often wrap their data in a single folder.
    let prefixLength = 0;
    while (allEntries.every(({ parts }) =>
      parts.length > prefixLength + 1 && parts[prefixLength] === allEntries[0].parts[prefixLength]
    )) {
      prefixLength++;
    }
    // The DOS DOTT.EXE alone can be mistaken for a Remastered detection file.
    const gamePaths = allEntries.map(({ parts }) => parts.slice(prefixLength).join("/").toLowerCase());
    if (gamePaths.includes("dott.exe") && gamePaths.every((path) => path === "dott.exe" || path === "bootdisk.exe")) {
      throw new ArchiveError("This ZIP is missing Day of the Tentacle game data. Include TENTACLE.000 and TENTACLE.001 from the original DOS game.");
    }
    for (const { entry, parts } of allEntries) {
      for (let depth = 1; depth < parts.length; depth++) {
        if (entries.has(parts.slice(0, depth).join("/").toLowerCase())) {
          throw new ArchiveError("This ZIP uses the same path for a file and folder.");
        }
      }

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
      files.push({ path: parts.slice(prefixLength).join("/"), data });
    }
    return files;
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
