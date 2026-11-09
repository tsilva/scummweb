const saveMagic = 0x5343564d; // SCVM
const headerSize = 48;
// The bundled English DOS CD release (CEM10) has 544 grid areas, 792 objects,
// and 100 inventory items in QUEEN.JAS. Queen serializes these before game state.
const roomOffset = headerSize + 2 + 544 * 16 + 12;
const gameStateOffset = roomOffset + 2 + 792 * 16 + 100 * 10;
const gameStateLength = 211;
const saveSizes = [24620, 24654];
const maxSaveSize = saveSizes.at(-1);
const maxCompressedSize = 32 * 1024;

async function decompressSave(bytes, format) {
  const output = new Uint8Array(maxSaveSize);
  const reader = new Blob([bytes]).stream().pipeThrough(new DecompressionStream(format)).getReader();
  let length = 0;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) return output.subarray(0, length);
      if (length + value.length > output.length) {
        await reader.cancel();
        return null;
      }
      output.set(value, length);
      length += value.length;
    }
  } finally {
    reader.releaseLock();
  }
}

export async function readQueenSaveSnapshot(contents) {
  if (!contents || contents.length > Math.ceil(maxCompressedSize / 3) * 4) return null;
  try {
    let bytes = Uint8Array.from(atob(contents), (char) => char.charCodeAt(0));
    if (bytes.length < 2 || bytes.length > maxCompressedSize) return null;
    const signature = (bytes[0] << 8) | bytes[1];
    if (signature === 0x1f8b) bytes = await decompressSave(bytes, "gzip");
    else if ((signature & 0x0f00) === 0x0800 && signature % 31 === 0) {
      bytes = await decompressSave(bytes, "deflate");
    }
    if (!bytes || bytes.length < headerSize) return null;
    const save = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const version = save.getUint32(4);
    if (save.getUint32(0) !== saveMagic || save.getUint32(8) !== 0
      || bytes.length !== saveSizes[version] || save.getUint32(12) !== bytes.length - headerSize) return null;
    const room_id = save.getUint16(roomOffset);
    if (room_id < 1 || room_id > 126) return null;
    const game_state = Array.from({ length: gameStateLength }, (_, index) => save.getInt16(gameStateOffset + index * 2));
    return { room_id, sample_time_ms: 0, banks: { game_state } };
  } catch {
    return null;
  }
}
