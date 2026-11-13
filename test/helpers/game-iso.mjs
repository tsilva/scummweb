const block = 2048;

export function bothEndian(bytes, offset, value, size = 4) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.length);
  if (size === 4) { view.setUint32(offset, value, true); view.setUint32(offset + 4, value); }
  else { view.setUint16(offset, value, true); view.setUint16(offset + 2, value); }
}

export function isoRecord(name, sector, size, directory = false, joliet = false) {
  const identifier = typeof name === "number" ? Uint8Array.of(name)
    : joliet ? Uint8Array.from([...name].flatMap((char) => [char.charCodeAt(0) >> 8, char.charCodeAt(0) & 255]))
      : new TextEncoder().encode(name);
  const bytes = new Uint8Array(33 + identifier.length + (identifier.length % 2 === 0 ? 1 : 0));
  bytes[0] = bytes.length;
  bothEndian(bytes, 2, sector);
  bothEndian(bytes, 10, size);
  bytes[25] = directory ? 2 : 0;
  bothEndian(bytes, 28, 1, 2);
  bytes[32] = identifier.length;
  bytes.set(identifier, 33);
  return bytes;
}

// A nested data disc with separate primary/Joliet directories, sector padding,
// version suffixes, and content spanning sectors. Return bytes for corruption tests.
export function gameIso({ joliet = false, contents = "123456789", filename = "VOL.CAT;1" } = {}) {
  const data = new TextEncoder().encode(contents);
  const bytes = new Uint8Array((30 + Math.ceil(data.length / block)) * block);
  function descriptor(sector, type, root) {
    const descriptor = bytes.subarray(sector * block, (sector + 1) * block);
    descriptor[0] = type;
    descriptor.set(new TextEncoder().encode("CD001"), 1);
    descriptor[6] = 1;
    if (type === 255) return;
    bothEndian(descriptor, 80, bytes.length / block);
    bothEndian(descriptor, 120, 1, 2);
    bothEndian(descriptor, 124, 1, 2);
    bothEndian(descriptor, 128, block, 2);
    descriptor.set(isoRecord(0, root, block, true), 156);
    if (type === 2) descriptor.set([0x25, 0x2f, 0x45], 88);
  }
  descriptor(16, 1, 20);
  if (joliet) descriptor(17, 2, 23);
  descriptor(joliet ? 18 : 17, 255);
  function directory(sector, records) {
    let offset = sector * block;
    for (const record of records) { bytes.set(record, offset); offset += record.length; }
  }
  function tree(root, nested, unicode) {
    directory(root, [isoRecord(0, root, block, true), isoRecord(1, root, block, true),
      isoRecord("GAME", nested, 2 * block, true, unicode)]);
    directory(nested, [isoRecord(0, nested, 2 * block, true), isoRecord(1, root, block, true)]);
    // The file appears after a zero-filled directory-sector tail.
    directory(nested + 1, [isoRecord(filename, 30, data.length, false, unicode)]);
  }
  tree(20, 21, false);
  if (joliet) tree(23, 24, true);
  bytes.set(data, 30 * block);
  return bytes;
}
