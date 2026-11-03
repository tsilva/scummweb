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
  const prepared = await prepareLocalFolder(folder, scanned.files);
  assert.equal(prepared.name, "Sfinx");
  assert.deepEqual((await readGameFolder(prepared.data)).map(({ path }) => path), ["disc1/vol.cat", "disc2/vol.dat"]);
});
