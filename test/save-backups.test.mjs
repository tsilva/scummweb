import assert from "node:assert/strict";
import test from "node:test";
import { applyImport, destinationMatches, exportBackup, getActiveSaveSets, getSaveDestinations, identifySet, matchDestination, readBackup } from "../app/save-backups/backups.mjs";
import { captureFilesystem, initializeSaveEdition, restoreSaveGroups, safePath } from "../app/save-backups/filesystem.mjs";
import { getCachedBrowserSave, getLatestBrowserSave, readBrowserSaveFiles } from "../app/browser-saves.mjs";
import { saveIndexKey, saveRevision } from "../web-shell/continue-saves.mjs";
import { acquireEditionSession, editionKey, editionLockName, readSaveTree } from "../web-shell/save-editions.mjs";

const bytes = (text) => new TextEncoder().encode(text);
const config = "[scummvm]\nsavepath=/home/web_user/.local/share/scummvm/saves\n";
const sky = { key: "catalog:sky", family: "sky", namespace: "", title: "Beneath a Steel Sky" };
const queen = { key: "catalog:queen", family: "queen", namespace: "", title: "Flight of the Amazon Queen" };
const shared = { key: "shared", family: "shared", namespace: "", title: "Other shared saves" };
const destinations = [sky, queen, shared];
const file = (path, text, modifiedAt = 100) => ({ path, data: bytes(text), modifiedAt });
async function set(destination, files) { const value = { destination, files }; return { ...value, hash: await identifySet(value) }; }

// Independent fixture follows BrowserFS's on-disk inode layout, not the writer.
function storageFixture(files = {}) {
  const values = new Map();
  let next = 0;
  function inode(tree, key) {
    const isDirectory = !(tree instanceof Uint8Array);
    const dataKey = `fixture-data-${++next}`;
    const data = isDirectory ? bytes(JSON.stringify(Object.fromEntries(Object.entries(tree).map(([name, child]) => {
      const childKey = `fixture-inode-${++next}`;
      inode(child, childKey);
      return [name, childKey];
    })))) : tree;
    const header = Buffer.alloc(30);
    header.writeUInt32LE(isDirectory ? 4096 : data.length, 0);
    header.writeUInt16LE(isDirectory ? 0x41ff : 0x81b6, 4);
    header.writeDoubleLE(100, 14);
    values.set(key, Buffer.concat([header, Buffer.from(dataKey)]).toString("base64"));
    values.set(dataKey, Buffer.from(data).toString("base64"));
  }
  inode({ "scummvm.ini": bytes(config), ".local": { share: { scummvm: { saves: files } } } }, "/");
  values.set("scummweb.other-preference", "preserve me");
  const storage = { values, getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, String(value)), removeItem: (key) => values.delete(key) };
  return storage;
}

async function restore(storage, sets, choices = [], options = {}) {
  const archived = [];
  await applyImport({ storage, destinations, rows: sets.map((value, index) => ({ set: value, destinationKey: matchDestination(value, options.destinations || destinations), choice: choices[index] || "imported" })),
    revision: captureFilesystem(storage).revision, initialConfig: config, preserve: async (values) => archived.push(...values), ...options });
  return archived;
}

test("backup ZIP preserves bytes, companion files and timestamps without browser inode IDs", async () => {
  const original = await set(sky, [file("SKY-VM.002", "progress", 9876), file("SKY-VM.INF", "index", 4567)]);
  const backup = await exportBackup([original]);
  const [restored] = await readBackup(backup);
  assert.deepEqual(restored.files, original.files);
  assert.equal(restored.hash, original.hash);
  assert.deepEqual(restored.destination, { ...sky, fingerprint: null });
});

test("different games merge and existing configuration/preferences stay intact", async () => {
  const storage = storageFixture({ "queen.s01": bytes("queen progress") });
  await restore(storage, [await set(sky, [file("SKY-VM.002", "sky progress")])]);
  assert.deepEqual(captureFilesystem(storage).files.map((item) => item.path).sort(), ["SKY-VM.002", "queen.s01"]);
  assert.equal(storage.getItem("scummweb.other-preference"), "preserve me");
  const home = captureFilesystem(storage).root;
  assert.equal(new TextDecoder().decode(home.children.get("scummvm.ini").data), config);
});

test("conflicts keep complete sets, skip identical contents, and preserve the other side before switching", async () => {
  const storage = storageFixture({ "SKY-VM.001": bytes("current"), "SKY-VM.INF": bytes("current index") });
  const imported = await set(sky, [file("SKY-VM.003", "imported"), file("SKY-VM.INF", "imported index")]);
  const preserved = await restore(storage, [imported], ["current"]);
  assert.equal(captureFilesystem(storage).files[0].path, "SKY-VM.001");
  assert.equal(preserved.length, 2);
  await restore(storage, [imported]);
  assert.deepEqual(captureFilesystem(storage).files.map((item) => item.path).sort(), ["SKY-VM.003", "SKY-VM.INF"]);
  assert.equal((await restore(storage, [imported])).length, 0, "identical data is not duplicated");
});

test("importing shared legacy saves never removes imported-version directories", async () => {
  const namespace = "version-" + "a".repeat(64);
  const storage = storageFixture({ [namespace]: { "game.001": bytes("personal progress") }, "unknown.001": bytes("old") });
  await restore(storage, [await set(shared, [file("other.001", "new")])]);
  assert.deepEqual(captureFilesystem(storage).files.map((item) => item.path).sort(), ["other.001", `${namespace}/game.001`]);
});

test("fingerprints reconnect the same local game across different source IDs", async () => {
  const fingerprint = "d".repeat(64);
  const [destination] = await getSaveDestinations([], [{ id: "new-browser-id", name: "My Game.zip", fingerprint }]);
  const imported = await set({ key: "version-" + "e".repeat(64), namespace: "version-" + "e".repeat(64), title: "My Game", fingerprint }, [file("game.001", "progress")]);
  assert.equal(matchDestination(imported, [destination]), destination.key);
  const storage = storageFixture();
  await restore(storage, [imported], [], { destinations: [destination], rows: [{ set: imported, destinationKey: destination.key, choice: "imported" }] });
  assert.equal(captureFilesystem(storage).files[0].path, `${destination.namespace}/game.001`);
  assert.equal(matchDestination(imported, []), "", "unmatched saves stay preserved until the matching game is added");
});

test("automatic matching preserves a missing edition instead of restoring to a game with the same title", async () => {
  const fingerprint = "a".repeat(64);
  const [otherEdition] = await getSaveDestinations([], [{ id: "other-edition", name: "My Game.zip", fingerprint: "b".repeat(64) }]);
  const namespace = "version-" + "c".repeat(64);
  const original = await set({ key: namespace, namespace, title: "My Game", fingerprint }, [file("game.001", "progress")]);
  const [imported] = await readBackup(await exportBackup([original]));
  const storage = storageFixture({ [otherEdition.namespace]: { "game.001": bytes("other progress") } });
  const before = captureFilesystem(storage);
  const preserved = await restore(storage, [imported], [], { destinations: [otherEdition] });
  assert.deepEqual(captureFilesystem(storage), before);
  assert.equal(preserved.length, 1);
  assert.deepEqual(preserved[0], imported);

  const [matchingEdition] = await getSaveDestinations([], [{ id: "matching-edition", name: "My Game.zip", fingerprint }]);
  await restore(storage, preserved, [], { destinations: [otherEdition, matchingEdition] });
  const files = captureFilesystem(storage).files;
  assert.equal(new TextDecoder().decode(files.find(({ path }) => path === `${matchingEdition.namespace}/game.001`).data), "progress");
  assert.equal(new TextDecoder().decode(files.find(({ path }) => path === `${otherEdition.namespace}/game.001`).data), "other progress");
});

test("quota failures roll back staged nodes without changing existing files", async () => {
  const storage = storageFixture({ "SKY-VM.001": bytes("current") });
  const before = new Map(storage.values);
  let writes = 0;
  const put = storage.setItem;
  storage.setItem = (key, value) => {
    if (++writes === 3) throw new DOMException("full", "QuotaExceededError");
    put(key, value);
  };
  await assert.rejects(restore(storage, [await set(sky, [file("SKY-VM.002", "new")])]), /current saves are unchanged/);
  assert.deepEqual(storage.values, before);
});

test("stale reviews and failed preservation never change active progress", async () => {
  const storage = storageFixture({ "SKY-VM.001": bytes("current") });
  const imported = await set(sky, [file("SKY-VM.002", "new")]);
  const before = new Map(storage.values);
  await assert.rejects(restore(storage, [imported], [], { preserve: async () => { throw new Error("IndexedDB unavailable"); } }), /IndexedDB/);
  assert.deepEqual(storage.values, before);
  await assert.rejects(restore(storage, [imported], [], { revision: "stale" }), /changed after review/);
  assert.deepEqual(storage.values, before);
});

test("atomic restore is readable by Continue and initializes first-use configuration", async (t) => {
  const storage = storageFixture();
  storage.values.clear();
  await restore(storage, [await set(sky, [file("SKY-VM.007", "progress", 200)])]);
  const previous = globalThis.window;
  t.after(() => { if (previous === undefined) delete globalThis.window; else globalThis.window = previous; });
  globalThis.window = { localStorage: storage };
  // A restored file must be indexed by the native engine before Continue is
  // offered; restoring arbitrary bytes alone is not proof of a valid save.
  assert.equal(await getLatestBrowserSave({ target: "sky" }, "test"), null);
  const { files } = await readBrowserSaveFiles({ target: "sky" });
  storage.setItem(saveIndexKey("", "sky"), JSON.stringify({ schemaVersion: 1, supported: true,
    engineId: "sky", gameId: "sky", target: "sky", revision: saveRevision(files), saves: [{ ...files[0], slot: 7 }] }));
  assert.equal(await getLatestBrowserSave({ target: "sky" }, "test"), 7);
  assert.equal(new TextDecoder().decode(captureFilesystem(storage).root.children.get("scummvm.ini").data), config);
});

test("ZIP validation rejects traversal, duplicate slots, wrong families, and unknown versions", async () => {
  const { ZipWriter, BlobWriter, TextReader } = await import("@zip.js/zip.js");
  async function malformed(change) {
    const blob = await exportBackup([await set(sky, [file("SKY-VM.001", "progress")])]);
    const { ZipReader, BlobReader, Uint8ArrayWriter, Uint8ArrayReader } = await import("@zip.js/zip.js");
    const reader = new ZipReader(new BlobReader(blob), { useWebWorkers: false });
    const entries = await reader.getEntries();
    const manifest = JSON.parse(await entries.find((entry) => entry.filename === "manifest.json").getData(new (await import("@zip.js/zip.js")).TextWriter()));
    change(manifest);
    const writer = new ZipWriter(new BlobWriter(), { useWebWorkers: false, level: 0 });
    for (const entry of entries.filter((entry) => entry.filename !== "manifest.json")) await writer.add(entry.filename, new Uint8ArrayReader(await entry.getData(new Uint8ArrayWriter())));
    await writer.add("manifest.json", new TextReader(JSON.stringify(manifest)));
    await reader.close();
    return writer.close();
  }
  await assert.rejects(readBackup(await malformed((m) => { m.sets[0].files[0].path = "../config"; })), /filename/);
  await assert.rejects(readBackup(await malformed((m) => { m.sets[0].files.push(m.sets[0].files[0]); })), /filename/);
  await assert.rejects(readBackup(await malformed((m) => { m.sets[0].files[0].path = "queen.s01"; })), /belong/);
  await assert.rejects(readBackup(await malformed((m) => { m.version = 99; })), /not supported/);
  await assert.rejects(readBackup(await malformed((m) => { m.sets[0].files[0].sha256 = "0".repeat(64); })), /integrity/);
  assert.equal(safePath("nested/save.001"), true);
  assert.equal(safePath("a\\b"), false);
  assert.equal(destinationMatches(shared, "version-" + "a".repeat(64)), false);
});

test("every staging failure, including the root commit, leaves the old filesystem intact", async () => {
  const updates = [{ namespace: "", matches: (name) => name.startsWith("SKY-VM."), files: [file("SKY-VM.002", "new")] }];
  const initial = storageFixture({ "SKY-VM.001": bytes("current") });
  let writeCount = 0;
  const write = initial.setItem;
  initial.setItem = (key, value) => { writeCount++; write(key, value); };
  restoreSaveGroups(initial, updates, captureFilesystem(initial).revision);
  for (let failAt = 1; failAt <= writeCount; failAt++) {
    const storage = storageFixture({ "SKY-VM.001": bytes("current") });
    const before = new Map(storage.values);
    const put = storage.setItem;
    let calls = 0;
    storage.setItem = (key, value) => {
      if (++calls === failAt) throw new DOMException("full", "QuotaExceededError");
      put(key, value);
    };
    assert.throws(() => restoreSaveGroups(storage, updates, captureFilesystem(storage).revision), /current saves are unchanged/);
    assert.deepEqual(storage.values, before, `write ${failAt} must roll back`);
  }
});

test("multiple histories can be preserved while only one set is activated", async () => {
  const storage = storageFixture();
  const first = await set(sky, [file("SKY-VM.001", "first")]);
  const second = await set(sky, [file("SKY-VM.002", "second")]);
  const preserved = await restore(storage, [first, second], ["imported", "stored"]);
  assert.equal(preserved.length, 2);
  assert.deepEqual(captureFilesystem(storage).files.map((item) => item.path), ["SKY-VM.001"]);
});

test("edition locks admit different games, reject duplicates, and exclude backups", async (t) => {
  const { withSaveLock, saveLockName } = await import("../app/save-backups/backups.mjs");
  const held = [];
  const locks = { async request(name, { mode, ifAvailable }, use) {
    assert.equal(ifAvailable, true);
    if (held.some(lock => lock.name === name && (lock.mode === "exclusive" || mode === "exclusive"))) return use(null);
    const lock = { name, mode };
    held.push(lock);
    try { return await use(lock); }
    finally { held.splice(held.indexOf(lock), 1); }
  } };
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, "navigator");
  t.after(() => { if (descriptor) Object.defineProperty(globalThis, "navigator", descriptor); else delete globalThis.navigator; });
  Object.defineProperty(globalThis, "navigator", { configurable: true, value: { locks } });
  const skyEdition = editionKey("", "sky");
  const queenEdition = editionKey("", "queen");
  await acquireEditionSession(locks, skyEdition);
  await acquireEditionSession(locks, queenEdition);
  assert.deepEqual(held.map(lock => lock.name), [
    saveLockName, editionLockName(skyEdition), saveLockName, editionLockName(queenEdition),
  ]);
  await assert.rejects(acquireEditionSession(locks, skyEdition), { name: "SaveSessionBusyError", busyReason: "edition" });
  await assert.rejects(acquireEditionSession(locks, ""), { name: "SaveSessionBusyError", busyReason: "storage" });
  await assert.rejects(withSaveLock(() => assert.fail("must not run while a game holds the lock")), /Close games/);
});

test("legacy edition migration preserves Continue, timestamps, companion files, and unclaimed saves", async (t) => {
  const namespace = "version-" + "a".repeat(64);
  const storage = storageFixture({
    "SKY-VM.007": bytes("progress"), "SKY-VM.SAV": bytes("descriptions"), "queen.s01": bytes("queen"),
    "custom.012": bytes("indexed save"), "unknown.001": bytes("unclaimed"),
    [namespace]: { "game.001": bytes("personal") },
  });
  const previous = globalThis.window;
  t.after(() => { if (previous === undefined) delete globalThis.window; else globalThis.window = previous; });
  globalThis.window = { localStorage: storage };
  const game = { target: "sky", gameId: "sky", engineId: "sky" };
  const { files } = await readBrowserSaveFiles(game);
  storage.setItem(saveIndexKey("", "sky"), JSON.stringify({ schemaVersion: 1, supported: true,
    engineId: "sky", gameId: "sky", target: "sky", revision: saveRevision(files),
    saves: [{ ...files.find(({ name }) => name === "SKY-VM.007"), slot: 7 },
      { ...files.find(({ name }) => name === "custom.012"), slot: 12 }] }));
  assert.equal(getCachedBrowserSave(game), 7);
  const skyRoot = initializeSaveEdition(storage, "catalog-sky");
  initializeSaveEdition(storage, "catalog-queen");
  initializeSaveEdition(storage, namespace);
  assert.equal(initializeSaveEdition(storage, "catalog-sky"), skyRoot);
  assert.equal(getCachedBrowserSave(game), 7);
  assert.equal(await getLatestBrowserSave(game), 7);
  const active = captureFilesystem(storage);
  assert.deepEqual(active.editions.get("catalog-sky"), [
    file("SKY-VM.007", "progress"), file("SKY-VM.SAV", "descriptions"), file("custom.012", "indexed save"),
  ]);
  assert.deepEqual(active.editions.get("catalog-queen"), [file("queen.s01", "queen")]);
  assert.deepEqual(active.editions.get(namespace), [file("game.001", "personal")]);
  assert.deepEqual(active.files, [file("unknown.001", "unclaimed")]);
});

test("scoped backup round trips nonstandard filenames into the right edition", async () => {
  const storage = storageFixture({ "SKY-VM.007": bytes("old"), "queen.s01": bytes("queen") });
  initializeSaveEdition(storage, "catalog-sky");
  initializeSaveEdition(storage, "catalog-queen");
  const imported = await set({ ...sky, isolated: true }, [file("companion.dat", "metadata")]);
  await restore(storage, await readBackup(await exportBackup([imported])));
  const active = await getActiveSaveSets(storage, destinations);
  assert.deepEqual(active.sets.find(({ destination }) => destination.key === sky.key).files, imported.files);
  assert.deepEqual(active.sets.find(({ destination }) => destination.key === queen.key).files, [file("queen.s01", "queen")]);

  const newStorage = storageFixture();
  await restore(newStorage, await readBackup(await exportBackup(active.sets)));
  assert.deepEqual(captureFilesystem(newStorage).editions.get("catalog-sky"), imported.files);
  const legacyBackup = await set(sky, [file("SKY-VM.002", "old backup format")]);
  await restore(newStorage, await readBackup(await exportBackup([legacyBackup])));
  assert.deepEqual(captureFilesystem(newStorage).editions.get("catalog-sky"), legacyBackup.files);
});

test("new edition initialization leaves other edition blocks unread and rolls back a failed migration", () => {
  const storage = storageFixture({ "SKY-VM.007": bytes("old"), "queen.s01": bytes("queen") });
  const skyRoot = initializeSaveEdition(storage, "catalog-sky");
  const before = new Map(storage.values);
  const { files, inode } = readSaveTree(storage, "catalog-sky");
  const liveKeys = [skyRoot, files["SKY-VM.007"], inode(files["SKY-VM.007"]).dataKey];
  const get = storage.getItem;
  storage.getItem = (key) => {
    assert.ok(!liveKeys.includes(key), "migration must not inspect files from a running edition");
    return get(key);
  };
  const put = storage.setItem;
  storage.setItem = (key, value) => {
    if (key === "/") throw new DOMException("full", "QuotaExceededError");
    put(key, value);
  };
  assert.throws(() => initializeSaveEdition(storage, "catalog-queen"), /current saves are unchanged/);
  assert.deepEqual(storage.values, before);
  storage.setItem = put;
  assert.ok(initializeSaveEdition(storage, "catalog-queen"));
  storage.getItem = get;
  assert.deepEqual(captureFilesystem(storage).editions.get("catalog-sky"), [file("SKY-VM.007", "old")]);
});

test("unsafe directory depth and prototype-like names cannot enter the save tree", () => {
  assert.equal(safePath(Array(25).fill("nested").join("/")), false);
  assert.equal(safePath("__proto__/save.001"), false);
  assert.equal(safePath("hasOwnProperty"), false);
});

test("restoring bytes invalidates native Continue metadata even when filenames and times match", async () => {
  const storage = storageFixture({ "SKY-VM.001": bytes("old") });
  Object.defineProperty(storage, "length", { get: () => storage.values.size });
  storage.key = (index) => [...storage.values.keys()][index] ?? null;
  storage.setItem("scummweb.continue.v1:catalog:sky", "old native metadata");
  const put = storage.setItem;
  let committed = false;
  storage.setItem = (key, value) => {
    if (key === "/") {
      assert.equal(storage.getItem("scummweb.continue.v1:catalog:sky"), null,
        "old metadata must be gone before replacement bytes become visible");
      committed = true;
    }
    put(key, value);
  };
  await restore(storage, [await set(sky, [file("SKY-VM.001", "new", 100)])]);
  assert.equal(committed, true);
  assert.equal(storage.getItem("scummweb.continue.v1:catalog:sky"), null);
  assert.equal(storage.getItem("scummweb.other-preference"), "preserve me");
});
