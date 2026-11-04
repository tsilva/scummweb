import assert from "node:assert/strict";
import test from "node:test";
import { BlobWriter, Uint8ArrayReader, ZipWriter } from "@zip.js/zip.js";
import { readGameFolder } from "../app/local-game-archive.mjs";
import { captureGameDrop, prepareLocalFolder, prepareLocalZip, scanGameFolder, selectedGameFolder } from "../app/local-game-import.mjs";

const fileEntry = (file) => ({
  name: file.name,
  isFile: true,
  file: (success) => success(file),
});

function directoryEntry(name, ...batches) {
  return {
    name,
    isDirectory: true,
    createReader() {
      let index = 0;
      return { readEntries: (success) => success(batches[index++] ?? []) };
    },
  };
}

test("a batch captures all drag items synchronously and reads nested legacy directory batches", async () => {
  const zip = new ZipWriter(new BlobWriter());
  await zip.add("game/vol.cat", new Uint8ArrayReader(Uint8Array.of(1, 2)));
  const file = new File([await zip.close()], "sfinx-en-v1.1.zip");
  const modernHandle = { kind: "file", name: file.name, getFile: async () => file };
  const captures = [];
  const item = (name, entry, handle) => ({
    kind: "file",
    webkitGetAsEntry: () => entry,
    getAsFile: () => null,
    getAsFileSystemHandle: async () => {
      captures.push(name);
      return handle;
    },
  });
  const folder = directoryEntry("Collection",
    [fileEntry(new File(["read me"], "README.txt"))],
    [directoryEntry("Nested", [fileEntry(file)])],
  );
  const roots = captureGameDrop({
    items: [item("archive", null, modernHandle), item("folder", folder, null)],
    files: [],
  });
  assert.deepEqual(captures, ["archive", "folder"]);
  const [archive, collection] = await Promise.all(roots);
  assert.equal((await prepareLocalZip(archive)).handle, modernHandle);
  const { archives, files } = await scanGameFolder(collection);
  assert.deepEqual(files.map(({ path }) => path), ["README.txt"]);
  assert.equal(archives.length, 1);
  assert.equal(archives[0].path, "Nested/sfinx-en-v1.1.zip");
  assert.equal((await prepareLocalZip(archives[0])).name, file.name);
});

test("a folder with loose game data becomes one playable entry with relative file paths", async () => {
  const file = new File([Uint8Array.of(1, 2)], "vol.cat");
  const folder = directoryEntry("Sfinx", [directoryEntry("data", [fileEntry(file)])]);
  const [root] = captureGameDrop({
    items: [{ kind: "file", getAsFile: () => null, webkitGetAsEntry: () => folder }],
    files: [],
  });
  const node = await root;
  const { archives, files } = await scanGameFolder(node);
  assert.deepEqual(archives, []);
  const prepared = await prepareLocalFolder(node, files);
  assert.equal(prepared.kind, "folder");
  assert.equal(prepared.name, "Sfinx");
  assert.deepEqual(await readGameFolder(prepared.data), [{ path: "vol.cat", data: Uint8Array.of(1, 2) }]);
});

test("a folder picked without native handles keeps the paths needed by the player", async () => {
  const files = ["disc1/vol.cat", "disc2/vol.dat"].map((path) => {
    const file = new File(["test"], path.split("/").at(-1));
    return Object.defineProperty(file, "webkitRelativePath", { value: `Sfinx/${path}` });
  });
  const folder = selectedGameFolder(files);
  const scanned = await scanGameFolder(folder);
  const updates = [];
  const prepared = await prepareLocalFolder(folder, scanned.files, (index, status) => {
    updates.push({ path: scanned.files[index].path, ...status });
  });
  assert.equal(prepared.name, "Sfinx");
  assert.deepEqual((await readGameFolder(prepared.data)).map(({ path }) => path), ["disc1/vol.cat", "disc2/vol.dat"]);
  assert.deepEqual(updates, [
    { path: "disc1/vol.cat", message: "Reading file…" },
    { path: "disc1/vol.cat", message: "File checked", complete: true },
    { path: "disc2/vol.dat", message: "Reading file…" },
    { path: "disc2/vol.dat", message: "File checked", complete: true },
  ]);
});

test("directory scan preserves distinct paths for archives with the same name", async () => {
  const game = new File(["test"], "game.zip");
  const folder = directoryEntry("Collection", [
    directoryEntry("DOS", [fileEntry(game)]),
    directoryEntry("Amiga", [fileEntry(game)]),
  ]);
  const [root] = captureGameDrop({
    items: [{ kind: "file", getAsFile: () => null, webkitGetAsEntry: () => folder }],
    files: [],
  });
  const { archives } = await scanGameFolder(await root);
  assert.deepEqual(archives.map(({ path }) => path), ["DOS/game.zip", "Amiga/game.zip"]);
  assert.equal(await archives[0].getFile(), game);
});

test("a file that fails to read is not reported as checked", async () => {
  const updates = [];
  await assert.rejects(prepareLocalFolder({ name: "Game" }, [{
    path: "data/vol.cat",
    getFile: async () => { throw new DOMException("File moved", "NotFoundError"); },
  }], (index, status) => updates.push({ index, ...status })), { name: "NotFoundError" });
  assert.deepEqual(updates, [{ index: 0, message: "Reading file…" }]);
});
