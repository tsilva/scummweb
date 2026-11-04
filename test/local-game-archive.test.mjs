import assert from "node:assert/strict";
import test from "node:test";
import { BlobWriter, Uint8ArrayReader, ZipWriter } from "@zip.js/zip.js";
import { maxExpandedSize, maxLocalGameSize, openLocalGameZip, readLocalGameArchive, scanLocalGameArchive, validateGameZip } from "../app/local-game-archive.mjs";

async function gameZip(paths) {
  const writer = new ZipWriter(new BlobWriter());
  for (const path of paths) {
    await writer.add(path, new Uint8ArrayReader(Uint8Array.of(1, 2, 3)));
  }
  return new File([await writer.close()], "game.zip");
}

test("a wrapped game keeps its file layout under the detected game directory", async () => {
  const zip = await gameZip(["Demo/000.lfl", "Demo/audio/track.ogg", "__MACOSX/._Demo"]);
  const files = await readLocalGameArchive(zip);

  assert.deepEqual(files, [
    { path: "000.lfl", data: Uint8Array.of(1, 2, 3) },
    { path: "audio/track.ogg", data: Uint8Array.of(1, 2, 3) },
  ]);
});

test("an archive cannot escape its in-memory game directory", async () => {
  const zip = await gameZip(["xx/config.ini"]);
  const bytes = Buffer.from(await zip.arrayBuffer());
  for (let index = bytes.indexOf("xx/config.ini"); index !== -1; index = bytes.indexOf("xx/config.ini")) {
    bytes.write("../config.ini", index);
  }

  await assert.rejects(
    readLocalGameArchive(new File([bytes], "game.zip")),
    /invalid file path/
  );
});

test("a DOS DOTT launcher without the game data reports the missing files", async () => {
  const zip = await gameZip(["BOOTDISK.EXE", "DOTT.EXE", "__MACOSX/._DOTT.EXE"]);
  await assert.rejects(readLocalGameArchive(zip), /missing Day of the Tentacle game data/);

  const completeZip = await gameZip(["DOTT.EXE", "TENTACLE.000", "TENTACLE.001"]);
  const files = await readLocalGameArchive(completeZip);
  assert.deepEqual(files.map(({ path }) => path), ["DOTT.EXE", "TENTACLE.000", "TENTACLE.001"]);
});

test("local ZIPs keep the 4 GiB size limit", () => {
  assert.doesNotThrow(() => validateGameZip({ name: "game.zip", size: maxLocalGameSize }, maxLocalGameSize));
  assert.throws(() => validateGameZip({ name: "game.zip", size: maxLocalGameSize + 1 }, maxLocalGameSize), /4096 MiB/);
});

test("large expanded ZIPs require uncompressed members and enforce the expanded cap", async () => {
  const file = await gameZip(["game/vol.cat"]);
  const bytes = Buffer.from(await file.arrayBuffer());
  const central = bytes.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]));
  bytes.writeUInt32LE(maxExpandedSize + 1, central + 24);
  await assert.rejects(scanLocalGameArchive(new File([bytes], "game.zip")), /ZIP created without compression/);
  // Two entries with these sizes exceed the aggregate 4 GiB cap.
  const pair = await gameZip(["a.dat", "b.dat"]);
  const oversized = Buffer.from(await pair.arrayBuffer());
  for (let offset = 0; (offset = oversized.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]), offset)) !== -1; offset += 4) {
    oversized.writeUInt32LE(3 * 1024 ** 3, offset + 24);
  }
  await assert.rejects(scanLocalGameArchive(new File([oversized], "game.zip")), /exceeds 4096 MiB when unpacked/);
});

test("a stored ZIP keeps member bytes accessible through file-backed slices", async () => {
  const writer = new ZipWriter(new BlobWriter());
  const block = new Blob([new Uint8Array(1024 * 1024)]);
  const data = new Blob(Array(129).fill(block));
  const { BlobReader } = await import("@zip.js/zip.js");
  await writer.add("game/video.dat", new BlobReader(data), { level: 0 });
  const zip = new File([await writer.close()], "game.zip");
  const [file] = await openLocalGameZip(zip);
  assert.equal(file.path, "video.dat");
  assert.equal(file.data, undefined);
  assert.equal(file.blob.size, data.size);
  assert.deepEqual(new Uint8Array(await file.blob.slice(-3).arrayBuffer()), Uint8Array.of(0, 0, 0));
});
