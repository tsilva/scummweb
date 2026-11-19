import assert from "node:assert/strict";
import test from "node:test";
import { captureFilesystem, initializeSaveEdition, restoreSaveGroups } from "../app/save-backups/filesystem.mjs";
import { readSaveTree } from "../web-shell/save-editions.mjs";
import { openLegacyRecoveryStorage, openSaveStorage } from "../web-shell/save-storage.mjs";
import { browserSaveStorage, indexedDbFixture } from "./helpers/dropbox-fixtures.mjs";

function setup(t, files) {
  const localStorage = browserSaveStorage(files);
  const indexedDB = indexedDbFixture();
  const navigator = { locks: { request: (_name, options, act = options) => act({}) } };
  const globals = { localStorage, indexedDB, navigator };
  for (const [name, value] of Object.entries(globals)) {
    const descriptor = Object.getOwnPropertyDescriptor(globalThis, name);
    Object.defineProperty(globalThis, name, { configurable: true, value });
    t.after(() => {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else delete globalThis[name];
    });
  }
  return globals;
}

test("migration retains shared, isolated, imported and autosave bytes and only removes legacy keys after commit", async t => {
  const namespace = "version-" + "a".repeat(64);
  const { localStorage, indexedDB } = setup(t, {
    "SKY-VM.001": Uint8Array.of(3, 5, 8),
    "queen.s01": Uint8Array.of(9, 1),
    [namespace]: { "game.007": Uint8Array.of(7), "companion.dat": Uint8Array.of(8),
      ".scummweb-autosave.2": Uint8Array.of(2) },
  });
  initializeSaveEdition(localStorage, "catalog-sky");
  initializeSaveEdition(localStorage, namespace);
  const indexKey = "scummweb.continue.v1:" + namespace;
  localStorage.setItem(indexKey, '{"pending":["game.010"]}');
  localStorage.setItem("scummweb.version:example", "chosen");
  const before = captureFilesystem(localStorage);
  indexedDB.fail = ({ names }) => Array.isArray(names) ? new DOMException("full", "QuotaExceededError") : undefined;
  await assert.rejects(openSaveStorage(), { name: "QuotaExceededError" });
  assert.equal(captureFilesystem(localStorage).revision, before.revision);
  assert.equal(localStorage.getItem(indexKey), '{"pending":["game.010"]}');

  indexedDB.fail = null;
  const migrated = await openSaveStorage();
  const after = captureFilesystem(migrated);
  assert.deepEqual(after.files, before.files);
  assert.deepEqual(after.editions, before.editions);
  assert.equal(migrated.getItem(indexKey), '{"pending":["game.010"]}');
  assert.equal(localStorage.getItem("/"), null);
  assert.equal(localStorage.getItem("scummweb.version:example"), "chosen");
  assert.equal(indexedDB.databases.get("scummweb.active-saves").get("migration").size, 1);
  assert.equal(captureFilesystem(await openSaveStorage()).editions.size, 2);
});

test("missing save data does not block migration of its siblings", async t => {
  const { localStorage, indexedDB } = setup(t, { "sky.001": Uint8Array.of(1), "sky.002": Uint8Array.of(2) });
  const tree = readSaveTree(localStorage, "");
  const damagedKey = tree.files["sky.002"];
  localStorage.removeItem(tree.inode(damagedKey).dataKey);
  const { files } = captureFilesystem(await openSaveStorage());
  assert.deepEqual(files.map(file => file.path), ["sky.001"]);
  const [archive] = indexedDB.databases.get("scummweb.active-saves").get("migration").values();
  assert.ok(archive.original.has(damagedKey));
});

test("migration preserves truncated legacy bytes as evidence and keeps intact slots active", async t => {
  const { localStorage, indexedDB } = setup(t, {
    "SKY-VM.001": Uint8Array.of(1, 2, 3),
    "SKY-VM.002": Uint8Array.of(4, 5, 6),
  });
  const tree = readSaveTree(localStorage, "");
  const damaged = tree.inode(tree.files["SKY-VM.002"]);
  const truncated = btoa(String.fromCharCode(4, 5));
  localStorage.setItem(damaged.dataKey, truncated);

  const { files } = captureFilesystem(await openSaveStorage());
  assert.deepEqual(files.map(({ path, data }) => [path, [...data]]), [["SKY-VM.001", [1, 2, 3]]]);
  const [archive] = indexedDB.databases.get("scummweb.active-saves").get("migration").values();
  assert.equal(archive.original.get(damaged.dataKey), truncated);
});

test("an unreadable legacy root leaves the original data untouched", async t => {
  const { localStorage, indexedDB } = setup(t, { "SKY-VM.001": Uint8Array.of(7) });
  const tree = readSaveTree(localStorage, "");
  localStorage.setItem("/", localStorage.getItem(tree.files["SKY-VM.001"]));
  const before = new Map(localStorage.values);
  await assert.rejects(openSaveStorage(), /Could not read the existing save directory/);
  assert.deepEqual(localStorage.values, before);
  assert.equal(indexedDB.databases.get("scummweb.active-saves").get("entries").size, 0);
});

test("IndexedDB saves larger than the old limit survive reopening and failed transactions retain earlier bytes", async t => {
  const { indexedDB } = setup(t, { "SKY-VM.001": Uint8Array.of(1) });
  const initial = await openSaveStorage();
  const before = captureFilesystem(initial);
  const data = new Uint8Array(6 * 1024 * 1024);
  data[0] = 15; data[data.length - 1] = 17;
  restoreSaveGroups(initial, [{ namespace: "", matches: () => true,
    files: [{ path: "SKY-VM.002", data, modifiedAt: 501 }] }], before.revision);
  indexedDB.fail = ({ names, mode }) => names === "entries" && mode === "readwrite"
    ? new DOMException("full", "QuotaExceededError") : undefined;
  await assert.rejects(initial.commit(), { name: "QuotaExceededError" });
  assert.deepEqual(captureFilesystem(await openSaveStorage()).files, before.files);

  indexedDB.fail = null;
  await initial.commit();
  assert.deepEqual(captureFilesystem(await openSaveStorage()).files, [{ path: "SKY-VM.002", data, modifiedAt: 501 }]);
});

test("commits from different editions preserve each other, and a queued commit never includes an unfinished native write", async t => {
  setup(t, {});
  const first = await openSaveStorage();
  const second = await openSaveStorage();
  const firstKey = crypto.randomUUID(), nextKey = crypto.randomUUID(), otherKey = crypto.randomUUID();
  first.setValue(firstKey, Uint8Array.of(1));
  const firstCommit = first.commit();
  first.setValue(nextKey, Uint8Array.of(2));
  const queuedCommit = first.commit();
  const checkpoint = first.checkpoint();
  first.setValue(nextKey, Uint8Array.of(3));
  second.setValue(otherKey, Uint8Array.of(4));
  await Promise.all([firstCommit, queuedCommit, second.commit()]);
  const saved = await openSaveStorage();
  assert.deepEqual(saved.getBytes(firstKey), Uint8Array.of(1));
  assert.deepEqual(saved.getBytes(nextKey), Uint8Array.of(2));
  assert.deepEqual(saved.getBytes(otherKey), Uint8Array.of(4));
  first.rollback(checkpoint);
  assert.equal(first.isCommitted(), true);
});

test("writes from a stale legacy page become recovery copies without replacing migrated active saves", async t => {
  const { localStorage } = setup(t, { "SKY-VM.001": Uint8Array.of(1) });
  await openSaveStorage();
  const stale = browserSaveStorage({ "SKY-VM.001": Uint8Array.of(2) });
  for (const [key, value] of stale.values) localStorage.setItem(key, value);
  assert.deepEqual(captureFilesystem(await openSaveStorage()).files[0].data, Uint8Array.of(1));
  const [recovery] = await openLegacyRecoveryStorage();
  assert.deepEqual(captureFilesystem(recovery).files[0].data, Uint8Array.of(2));
  assert.equal(localStorage.getItem("/"), null);
});
