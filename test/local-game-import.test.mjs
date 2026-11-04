import assert from "node:assert/strict";
import test from "node:test";
import { BlobWriter, Uint8ArrayReader, ZipWriter } from "@zip.js/zip.js";
import { captureGameDrop, fileNode, handleNode, prepareLocalZip } from "../app/local-game-import.mjs";

async function gameZip() {
  const zip = new ZipWriter(new BlobWriter());
  await zip.add("game/vol.cat", new Uint8ArrayReader(Uint8Array.of(1, 2)));
  return new File([await zip.close()], "sfinx-en-v1.1.zip");
}

test("a mixed drop captures every handle synchronously and accepts only ZIP files", async () => {
  const file = await gameZip();
  const zipHandle = { kind: "file", name: file.name, getFile: async () => file };
  const folderHandle = { kind: "directory", name: "Collection.zip", values: () => assert.fail("Do not scan directories") };
  const captures = [];
  const roots = captureGameDrop({
    items: [zipHandle, folderHandle, { kind: "file", name: "vol.cat", getFile: async () => new File(["data"], "vol.cat") }]
      .map((handle) => ({
        kind: "file", getAsFile: () => null,
        getAsFileSystemHandle: () => { captures.push(handle.name); return Promise.resolve(handle); },
      })),
    files: [],
  });
  assert.deepEqual(captures, [file.name, "Collection.zip", "vol.cat"]);
  const [archive, folder, loose] = await Promise.all(roots);
  assert.equal((await prepareLocalZip(archive)).handle, zipHandle);
  await assert.rejects(prepareLocalZip(folder), /Only ZIP files containing ScummVM games/);
  await assert.rejects(prepareLocalZip(loose), /Choose a ZIP/);
});

test("legacy directory drops are rejected without reading their children", async () => {
  const [root] = captureGameDrop({
    items: [{ kind: "file", getAsFile: () => null, webkitGetAsEntry: () => ({
      name: "Collection", isDirectory: true,
      createReader: () => assert.fail("Do not scan directories"),
    }) }], files: [],
  });
  await assert.rejects(prepareLocalZip(await root), /Only ZIP files containing ScummVM games/);
});

test("legacy file drops still import ZIPs when native handles are unavailable", async () => {
  const file = await gameZip();
  const [root] = captureGameDrop({
    items: [{ kind: "file", getAsFile: () => null,
      getAsFileSystemHandle: async () => { throw new Error("Unsupported"); },
      webkitGetAsEntry: () => ({ name: file.name, isFile: true, file: (success) => success(file) }),
    }], files: [],
  });
  const game = await prepareLocalZip(await root);
  assert.equal(game.kind, "zip");
  assert.equal(game.data, file);
  assert.equal(game.handle, undefined);
});

test("file-list drops import multiple ZIPs without persistent handles", async () => {
  const files = [await gameZip(), await gameZip()];
  const roots = captureGameDrop({ items: [], files });
  const games = await Promise.all(roots.map(async (root) => prepareLocalZip(await root)));
  assert.deepEqual(games.map(({ data }) => data), files);
});

test("loose files and alternate archive formats are rejected", async () => {
  for (const name of ["sky.dsk", "game.7z", "game.rar", "game.tar", "game.zip.exe"]) {
    await assert.rejects(prepareLocalZip(fileNode(new File(["data"], name))), /Choose a ZIP/);
  }
  await assert.rejects(prepareLocalZip(fileNode(new File(["not a zip"], "game.zip"))), /not a readable ZIP/);
});

test("a directory named with a ZIP extension cannot enter through the picker adapter", async () => {
  await assert.rejects(prepareLocalZip(handleNode({ kind: "directory", name: "game.zip" })), /Only ZIP/);
});

test("ZIP file read failures remain errors", async () => {
  await assert.rejects(prepareLocalZip({ kind: "file", name: "game.zip",
    getFile: async () => { throw new DOMException("File moved", "NotFoundError"); },
  }), { name: "NotFoundError" });
});
