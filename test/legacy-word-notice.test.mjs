import assert from "node:assert/strict";
import test from "node:test";
import { readLegacyWordNotice } from "../scripts/read-legacy-word-notice.mjs";

function notice() {
  const bytes = Buffer.alloc(11 * 512);
  Buffer.from("d0cf11e0a1b11ae1", "hex").copy(bytes);
  for (const [offset, value] of [[26, 3], [28, 0xfffe], [30, 9], [32, 6]]) bytes.writeUInt16LE(value, offset);
  bytes.writeUInt32LE(1, 44);
  bytes.writeUInt32LE(1, 48);
  bytes.writeUInt32LE(4096, 56);
  bytes.fill(0xff, 76, 512);
  bytes.writeUInt32LE(0, 76);
  bytes.fill(0xff, 512, 1024);
  bytes.writeUInt32LE(0xfffffffd, 512);
  bytes.writeUInt32LE(0xfffffffe, 516);
  for (let id = 2; id < 10; id += 1) bytes.writeUInt32LE(id === 9 ? 0xfffffffe : id + 1, 512 + id * 4);
  Buffer.from("WordDocument\0", "utf16le").copy(bytes, 1024);
  bytes.writeUInt16LE(26, 1024 + 64);
  bytes[1024 + 66] = 2;
  bytes.writeUInt32LE(2, 1024 + 116);
  bytes.writeUInt32LE(4096, 1024 + 120);
  const word = bytes.subarray(1536);
  word.writeUInt16LE(0xa5dc, 0);
  word.writeUInt16LE(101, 2);
  word.writeUInt16LE(0x0409, 6);
  const text = Buffer.from([32, 9, 0x93, ...Buffer.from("Original notice"), 0x94, 13, ...Buffer.from("All rights retained."), 13]);
  word.writeUInt32LE(64, 24);
  word.writeUInt32LE(64 + text.length, 28);
  text.copy(word, 64);
  return bytes;
}

test("legacy Word notices decode only the original text, including paragraph breaks", () => {
  assert.equal(readLegacyWordNotice(notice()), "        “Original notice”\nAll rights retained.\n");
});

test("legacy Word notices reject damaged allocation chains and text boundaries", () => {
  for (const damage of [
    (bytes) => bytes.writeUInt32LE(2, 512 + 2 * 4),
    (bytes) => bytes.writeUInt32LE(999, 1024 + 116),
    (bytes) => bytes.writeUInt32LE(9999, 1536 + 28),
    (bytes) => bytes.writeUInt32LE(4097, 1024 + 120),
  ]) {
    const bytes = notice();
    damage(bytes);
    assert.throws(() => readLegacyWordNotice(bytes), /Unsupported or invalid/);
  }
});

test("legacy Word notices reject unsupported encrypted, fast-saved and Unicode formats", () => {
  for (const flags of [0x0004, 0x0100, 0x1000]) {
    const bytes = notice();
    bytes.writeUInt16LE(flags, 1536 + 10);
    assert.throws(() => readLegacyWordNotice(bytes), /Unsupported or invalid/);
  }
});
