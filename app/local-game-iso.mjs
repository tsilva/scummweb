import { ArchiveError, maxGameEntries, maxLocalGameSize, validateLocalGameArchive } from "./local-game-selection.mjs";
import { gameEntries, gamePathParts } from "./game-file-entries.mjs";

// ECMA-119 directory records and Annex C (Joliet). Read only cooked,
// 2048-byte data sectors; never mount or execute disc contents.
const sectorSize = 2048;
const maxDirectoryBytes = 32 * 1024 * 1024;
const invalidIso = () => new ArchiveError("This ISO has an invalid or incomplete filesystem.");

function bothEndian(view, offset, bytes) {
  const little = bytes === 4 ? view.getUint32(offset, true) : view.getUint16(offset, true);
  const big = bytes === 4 ? view.getUint32(offset + bytes) : view.getUint16(offset + bytes);
  if (little !== big) throw invalidIso();
  return little;
}

async function isoEntries(file, { signal, archiveLimit = maxLocalGameSize, expandedLimit = maxLocalGameSize } = {}) {
  validateLocalGameArchive(file, archiveLimit);
  let volumeSize = file.size;
  async function read(start, size) {
    signal?.throwIfAborted();
    if (!Number.isSafeInteger(start) || start < 0 || start + size > volumeSize) throw invalidIso();
    const bytes = new Uint8Array(await file.slice(start, start + size).arrayBuffer());
    signal?.throwIfAborted();
    if (bytes.length !== size) throw invalidIso();
    return bytes;
  }

  let primary, joliet, terminated = false;
  for (let sector = 16; sector < 272 && (sector + 1) * sectorSize <= file.size; sector++) {
    const bytes = await read(sector * sectorSize, sectorSize);
    if (String.fromCharCode(...bytes.subarray(1, 6)) !== "CD001" || bytes[6] !== 1) break;
    if (bytes[0] === 255) { terminated = true; break; }
    if (bytes[0] === 1 && !primary) primary = bytes;
    if (bytes[0] === 2 && bytes[88] === 0x25 && bytes[89] === 0x2f &&
        [0x40, 0x43, 0x45].includes(bytes[90])) joliet = bytes;
  }
  if (!primary || !terminated) {
    throw new ArchiveError("This file is not a readable ISO 9660 disc image. Use an ISO 9660 or Joliet data disc, or ZIP the extracted game files.");
  }
  const descriptor = joliet ?? primary;
  const volume = new DataView(descriptor.buffer);
  if (bothEndian(volume, 128, 2) !== sectorSize || bothEndian(volume, 120, 2) !== 1 ||
      bothEndian(volume, 124, 2) !== 1) {
    throw new ArchiveError("This ISO uses an unsupported block size or multiple volumes. ZIP the extracted game files instead.");
  }
  volumeSize = bothEndian(volume, 80, 4) * sectorSize;
  if (volumeSize > file.size || volumeSize < 18 * sectorSize) throw invalidIso();

  function record(bytes) {
    const length = bytes[0], nameLength = bytes[32];
    if (length < 34 || length > bytes.length || !nameLength || 33 + nameLength > length) throw invalidIso();
    const view = new DataView(bytes.buffer, bytes.byteOffset, length);
    if (bytes[26] || bytes[27] || bytes[25] & 0x80) {
      throw new ArchiveError("This ISO uses interleaved or multi-extent files. ZIP the extracted game files instead.");
    }
    if (bothEndian(view, 28, 2) !== 1) throw invalidIso();
    const start = (bothEndian(view, 2, 4) + bytes[1]) * sectorSize;
    const size = bothEndian(view, 10, 4);
    if (start + size > volumeSize) throw invalidIso();
    const identifier = bytes.subarray(33, 33 + nameLength);
    const special = nameLength === 1 && identifier[0] < 2;
    let name;
    if (!special) {
      if (joliet) {
        if (nameLength % 2) throw invalidIso();
        name = "";
        for (let i = 0; i < nameLength; i += 2) name += String.fromCharCode(identifier[i] * 256 + identifier[i + 1]);
      } else name = String.fromCharCode(...identifier);
      name = name.replace(/;[0-9]+$/, "").replace(/\.$/, "");
      // An identifier is one component, never an embedded path.
      if (gamePathParts(name).length !== 1) throw invalidIso();
    }
    return { start, size, name, special, directory: Boolean(bytes[25] & 2) };
  }

  const root = record(descriptor.subarray(156));
  if (!root.directory || !root.special) throw invalidIso();
  const pending = [{ ...root, parts: [] }], visited = new Set(), paths = new Set(), files = new Map();
  let count = 0, metadataSize = 0, totalSize = 0;
  while (pending.length) {
    const directory = pending.pop();
    if (visited.has(directory.start) || !directory.size || directory.size % sectorSize) throw invalidIso();
    visited.add(directory.start);
    metadataSize += directory.size;
    if (metadataSize > maxDirectoryBytes) throw new ArchiveError("This ISO contains too much directory data.");
    for (let offset = 0; offset < directory.size; offset += sectorSize) {
      const bytes = await read(directory.start + offset, sectorSize);
      for (let pos = 0; pos < bytes.length && bytes[pos]; pos += bytes[pos]) {
        if (++count > maxGameEntries) throw new ArchiveError("This ISO contains too many entries.");
        const item = record(bytes.subarray(pos));
        if (item.special) continue;
        const parts = [...directory.parts, item.name], path = parts.join("/");
        gamePathParts(path);
        const key = path.toLowerCase();
        if (paths.has(key)) throw new ArchiveError("This ISO contains duplicate file paths.");
        paths.add(key);
        if (item.directory) pending.push({ ...item, parts });
        else {
          totalSize += item.size;
          if (totalSize > expandedLimit) throw new ArchiveError(`This ISO exceeds ${expandedLimit / (1024 * 1024)} MiB of game files.`);
          files.set(key, { parts, start: item.start, size: item.size });
        }
      }
    }
  }
  return gameEntries(files);
}

const crcTable = Uint32Array.from({ length: 256 }, (_, value) => {
  for (let bit = 0; bit < 8; bit++) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  return value >>> 0;
});

export async function scanGameIso(file, options = {}) {
  const entries = await isoEntries(file, options), files = [];
  // ISO directories have no content checksums. Stream CRC-32 so changed
  // same-size editions stay distinct and bundled-copy matching works for ISOs.
  for (const { path, start, size } of entries) {
    let crc = 0xffffffff;
    for (let offset = 0; offset < size; offset += 1024 * 1024) {
      options.signal?.throwIfAborted();
      const length = Math.min(1024 * 1024, size - offset);
      const bytes = new Uint8Array(await file.slice(start + offset, start + offset + length).arrayBuffer());
      if (bytes.length !== length) throw invalidIso();
      for (const byte of bytes) crc = crcTable[(crc ^ byte) & 255] ^ (crc >>> 8);
    }
    options.signal?.throwIfAborted();
    files.push([path, size, (crc ^ 0xffffffff) >>> 0]);
  }
  return files;
}

export async function openGameIso(file, options = {}) {
  const entries = await isoEntries(file, options);
  return entries.map(({ path, start, size }) => ({ path, blob: file.slice(start, start + size) }));
}
