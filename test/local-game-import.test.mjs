import assert from "node:assert/strict";
import test from "node:test";
import { BlobWriter, Uint8ArrayReader, ZipWriter } from "@zip.js/zip.js";
import { captureGameDrop, collectGameImportNodes, fileNode, handleNode, inspectLocalSourceFiles, prepareLocalZip } from "../app/local-game-import.mjs";

async function gameZip() {
  const zip = new ZipWriter(new BlobWriter());
  await zip.add("game/vol.cat", new Uint8ArrayReader(Uint8Array.of(1, 2)));
  return new File([await zip.close()], "sfinx-en-v1.1.zip");
}

test("a mixed drop captures every handle synchronously and recursively imports folder ZIPs", async () => {
  const file = await gameZip();
  const zipHandle = { kind: "file", name: file.name, getFile: async () => file };
  const nestedHandle = { ...zipHandle, name: "nested.ZIP" };
  const folderHandle = { kind: "directory", name: "Collection", async *values() {
    yield { kind: "file", name: ".DS_Store", getFile: () => assert.fail("Ignore non-ZIPs") };
    yield { kind: "directory", name: "Subfolder", async *values() { yield nestedHandle; } };
  } };
  const captures = [];
  const roots = captureGameDrop({
    items: [zipHandle, folderHandle, { kind: "file", name: "vol.cat", getFile: async () => new File(["data"], "vol.cat") }]
      .map((handle) => ({
        kind: "file", getAsFile: () => null,
        getAsFileSystemHandle: () => { captures.push(handle.name); return Promise.resolve(handle); },
      })),
    files: [],
  });
  assert.deepEqual(captures, [file.name, "Collection", "vol.cat"]);
  const [archive, nested, loose] = await collectGameImportNodes(roots);
  assert.equal((await prepareLocalZip(archive)).handle, zipHandle);
  assert.equal((await prepareLocalZip(nested)).handle, nestedHandle);
  await assert.rejects(prepareLocalZip(loose), /Choose a ZIP/);
});

test("legacy folder drops read every directory batch and nested folder", async () => {
  const file = await gameZip();
  const entry = (name) => ({ name, isFile: true, file: (success) => success(file) });
  const directory = (name, batches) => ({ name, isDirectory: true, createReader() {
    let index = 0;
    return { readEntries: (success) => success(batches[index++] ?? []) };
  } });
  const root = directory("Collection", [
    Array.from({ length: 100 }, (_, index) => entry(`game-${index}.zip`)),
    [entry("last.ZIP"), entry("notes.txt"), directory("Nested", [[entry("nested.zip")]])],
  ]);
  const nodes = await collectGameImportNodes(captureGameDrop({
    items: [{ kind: "file", getAsFile: () => null, webkitGetAsEntry: () => root }], files: [],
  }));
  assert.equal(nodes.length, 102);
  assert.equal(nodes.at(-2).name, "last.ZIP");
  assert.equal(nodes.at(-1).name, "nested.zip");
  assert.equal((await prepareLocalZip(nodes.at(-1))).data, file);
});

test("folders without ZIPs produce a useful error", async () => {
  for (const children of [[], [{ kind: "file", name: "notes.txt" }], [{ kind: "file", name: ".hidden.zip" }]]) {
    const nodes = await collectGameImportNodes([handleNode({ kind: "directory", name: "Empty", async *values() {
      yield* children;
    } })]);
    assert.equal(nodes.length, 1);
    assert.equal(nodes[0].name, "Empty");
    await assert.rejects(prepareLocalZip(nodes[0]), /No ZIP files found/);
  }
});

test("import scans skip dotfiles selected directly or found in folders", async () => {
  const file = await gameZip();
  const sidecar = new File(["AppleDouble"], `._${file.name}`);
  const hiddenZip = new File([file], ".hidden.ZIP");
  const folder = handleNode({ kind: "directory", name: "Collection", async *values() {
    for (const child of [sidecar, file, hiddenZip]) {
      yield { kind: "file", name: child.name, getFile: async () => child };
    }
  } });

  const nodes = await collectGameImportNodes([fileNode(sidecar), fileNode(hiddenZip), folder]);
  assert.deepEqual(nodes.map(({ name }) => name), [file.name]);
  assert.equal((await prepareLocalZip(nodes[0])).data, file);
});

test("unreadable subfolders preserve readable siblings and report the failing folder", async () => {
  const file = await gameZip();
  const nodes = await collectGameImportNodes([handleNode({ kind: "directory", name: "Collection", async *values() {
    yield { kind: "directory", name: "Denied", async *values() { throw new Error("Access denied"); } };
    yield { kind: "file", name: file.name, getFile: async () => file };
  } })]);
  assert.equal(nodes.length, 2);
  assert.equal(nodes[0].name, "Denied");
  await assert.rejects(prepareLocalZip(nodes[0]), /Access denied/);
  assert.equal((await prepareLocalZip(nodes[1])).data, file);
});

test("legacy reader failures are reported alongside other dropped ZIPs", async () => {
  const file = await gameZip();
  const roots = captureGameDrop({
    items: [{ kind: "file", getAsFile: () => null, webkitGetAsEntry: () => ({ name: "Unreadable", isDirectory: true,
      createReader: () => ({ readEntries: (_success, failure) => failure(new Error("Read failed")) }),
    }) }], files: [],
  });
  const nodes = await collectGameImportNodes([...roots, fileNode(file)]);
  await assert.rejects(prepareLocalZip(nodes[0]), /Read failed/);
  assert.equal((await prepareLocalZip(nodes[1])).data, file);
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

test("existing imports are inspected with granted access and changed ZIPs invalidate the directory cache", async () => {
  const original = await gameZip();
  let file = new File([original], original.name, { lastModified: 1 });
  let permission = "prompt";
  let reads = 0;
  const source = { handle: { kind: "file", queryPermission: async () => permission,
    requestPermission: () => assert.fail("Background inspection must not request access"),
    getFile: async () => { reads++; return file; } } };
  const cache = new WeakMap();
  assert.equal(await inspectLocalSourceFiles(source, cache), undefined);
  assert.equal(reads, 0);
  permission = "granted";
  const files = await inspectLocalSourceFiles(source, cache);
  assert.deepEqual(files, (await prepareLocalZip(fileNode(file))).archiveFiles);
  assert.equal(await inspectLocalSourceFiles(source, cache), files);
  const zip = new ZipWriter(new BlobWriter());
  await zip.add("game/vol.cat", new Uint8ArrayReader(Uint8Array.of(3, 4)));
  file = new File([await zip.close()], original.name, { lastModified: 2 });
  assert.notDeepEqual(await inspectLocalSourceFiles(source, cache), files);
  assert.equal(await inspectLocalSourceFiles({ url: "https://example.com/game.zip", ...source }, cache), undefined);
});
