import assert from "node:assert/strict";
import test from "node:test";
import { BlobWriter, Uint8ArrayReader, ZipWriter } from "@zip.js/zip.js";
import { maxExpandedSize, readGameFolder, readLocalGameArchive } from "../app/local-game-archive.mjs";

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

test("a large local folder hands the player the original file without unpacking it", async () => {
  const blockSize = 1024 * 1024;
  const block = new Blob([new Uint8Array(blockSize)]);
  const file = new File(Array(maxExpandedSize / blockSize + 1).fill(block), "video.dat");
  const files = await readGameFolder([{ file, path: "game/video.dat" }]);
  assert.deepEqual(files, [{ path: "video.dat", blob: file }]);
});
