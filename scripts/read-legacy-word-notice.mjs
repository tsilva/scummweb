// Narrow reader for unencrypted, non-fast-saved English Word 6/95 notices.
// CFB: https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-cfb/
// Word FIB: https://download.microsoft.com/download/0/b/e/0be8bdd7-e5e8-422a-abfd-4342ed7ad886/word97-2007binaryfileformat(doc)specification.pdf
export function readLegacyWordNotice(bytes) {
  const require = (condition) => {
    if (!condition) throw new Error("Unsupported or invalid legacy Word notice");
  };
  require(bytes.length >= 1536 && bytes.length <= 2 * 1024 * 1024 && bytes.length % 512 === 0);
  require(bytes.subarray(0, 8).equals(Buffer.from("d0cf11e0a1b11ae1", "hex")));
  require(bytes.readUInt16LE(26) === 3 && bytes.readUInt16LE(28) === 0xfffe
    && bytes.readUInt16LE(30) === 9 && bytes.readUInt16LE(32) === 6
    && bytes.readUInt32LE(56) === 4096 && bytes.readUInt32LE(72) === 0);
  const count = bytes.length / 512 - 1;
  const fatCount = bytes.readUInt32LE(44);
  require(fatCount > 0 && fatCount <= 109 && fatCount <= count);
  const used = new Set();
  const sector = (id) => {
    require(id < count);
    return bytes.subarray((id + 1) * 512, (id + 2) * 512);
  };
  const fat = [];
  for (let i = 0; i < fatCount; i += 1) {
    const id = bytes.readUInt32LE(76 + i * 4);
    require(!used.has(id));
    used.add(id);
    const block = sector(id);
    for (let j = 0; j < 512; j += 4) fat.push(block.readUInt32LE(j));
  }
  const chain = (first, size) => {
    const blocks = [];
    let id = first;
    while (id !== 0xfffffffe) {
      require(id < fat.length && !used.has(id));
      used.add(id);
      blocks.push(sector(id));
      id = fat[id];
    }
    require(blocks.length > 0 && (size === undefined || blocks.length === Math.ceil(size / 512)));
    const data = Buffer.concat(blocks);
    return size === undefined ? data : data.subarray(0, size);
  };
  const directory = chain(bytes.readUInt32LE(48));
  const matches = [];
  for (let offset = 0; offset < directory.length; offset += 128) {
    const entry = directory.subarray(offset, offset + 128);
    if (entry[66] !== 2) continue;
    const nameLength = entry.readUInt16LE(64);
    require(nameLength >= 2 && nameLength <= 64 && nameLength % 2 === 0
      && entry.readUInt16LE(nameLength - 2) === 0);
    if (entry.subarray(0, nameLength - 2).toString("utf16le") === "WordDocument") matches.push(entry);
  }
  require(matches.length === 1);
  const entry = matches[0];
  const size = entry.readUInt32LE(120);
  // Small/mini streams and larger Word formats need their own reviewed reader.
  require(size >= 4096 && size <= bytes.length && entry.readUInt32LE(124) === 0);
  const word = chain(entry.readUInt32LE(116), size);
  require(word.readUInt16LE(0) === 0xa5dc && [101, 104].includes(word.readUInt16LE(2))
    && [0x0409, 0x0809].includes(word.readUInt16LE(6)) && (word.readUInt16LE(10) & 0x1104) === 0);
  const start = word.readUInt32LE(24);
  const end = word.readUInt32LE(28);
  require(start >= 32 && start < end && end <= word.length);
  const text = new TextDecoder("windows-1252").decode(word.subarray(start, end));
  require(!/[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(text));
  return text.replaceAll("\r\n", "\n").replaceAll("\r", "\n").replace(/^[ \t]+/gm, (indent) => {
    let column = 0;
    for (const character of indent) column += character === "\t" ? 8 - column % 8 : 1;
    return " ".repeat(column);
  });
}
