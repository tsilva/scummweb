import assert from "node:assert/strict";
import test from "node:test";
import { cancelBrowserSaveQueries, getCachedBrowserSave, getLatestBrowserSave, readBrowserSaveFiles, subscribeBrowserSaves } from "../app/browser-saves.mjs";
import { saveIndexKey, saveRevision } from "../web-shell/continue-saves.mjs";
import { getVersionSaveNamespace } from "../app/game-versions.mjs";

function makeBrowserStorage(files, namespaces = {}) {
  const values = new Map();

  function put(key, mode, contents, modifiedAt = 0) {
    const dataKey = `data-${key}`;
    const inode = Buffer.alloc(30);
    inode.writeUInt32LE(Buffer.byteLength(contents), 0);
    inode.writeUInt16LE(mode, 4);
    inode.writeDoubleLE(modifiedAt, 14);
    values.set(key, Buffer.concat([inode, Buffer.from(dataKey)]).toString("base64"));
    values.set(dataKey, Buffer.from(contents).toString("base64"));
  }

  function directory(key, entries) {
    put(key, 0x4000, JSON.stringify(entries));
  }

  directory("/", { ".local": "local" });
  directory("local", { share: "share" });
  directory("share", { scummvm: "scummvm" });
  directory("scummvm", { saves: "saves" });
  directory("saves", { ...Object.fromEntries(files.map(([name]) => [name, name])),
    ...Object.fromEntries(Object.keys(namespaces).map((name) => [name, `namespace:${name}`])) });
  for (const [name, contents, modifiedAt] of files) {
    put(name, 0x8000, contents, modifiedAt);
  }
  for (const [namespace, saves] of Object.entries(namespaces)) {
    directory(`namespace:${namespace}`, Object.fromEntries(saves.map(([name]) => [name, `${namespace}:${name}`])));
    for (const [name, contents, modifiedAt] of saves) put(`${namespace}:${name}`, 0x8000, contents, modifiedAt);
  }
  return { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
}

async function indexSaves(game, slots, supported = true) {
  const { namespace, files } = await readBrowserSaveFiles(game);
  window.localStorage.setItem(saveIndexKey(namespace, game.target), JSON.stringify({
    schemaVersion: 1, engineId: game.engineId || "sky", gameId: game.gameId || "sky", supported,
    target: game.target, revision: saveRevision(files),
    saves: slots.map(([name, slot]) => ({ ...files.find((file) => file.name === name), slot })),
  }));
}

function useStorage(t, storage) {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, "window");
  t.after(() => { if (descriptor) Object.defineProperty(globalThis, "window", descriptor); else delete globalThis.window; });
  globalThis.window = { localStorage: storage };
}

test("Continue chooses the newest native-listed player save, not the highest slot or checkpoint", async (t) => {
  const game = { target: "sky", engineId: "sky", gameId: "sky" };
  useStorage(t, makeBrowserStorage([
    ["SKY-VM.000", "bundled intro", 50], ["SKY-VM.007", "older save", 10],
    ["SKY-VM.002", "newer save", 30], ["queen.s09", "another game", 60],
  ]));
  await indexSaves(game, [["SKY-VM.007", 7], ["SKY-VM.002", 2]]);
  assert.equal(await getLatestBrowserSave(game, "test"), 2);
  window.localStorage = makeBrowserStorage([["SKY-VM.000", "actual player save", 70]]);
  await indexSaves(game, [["SKY-VM.000", 0]]);
  assert.equal(await getLatestBrowserSave(game, "test"), 0);
  await indexSaves(game, []);
  assert.equal(await getLatestBrowserSave(game, "test"), null);
});

test("Continue is isolated to the imported version, including an unknown ZIP title", async (t) => {
  const dos = await getVersionSaveNamespace("dos"), amiga = await getVersionSaveNamespace("amiga");
  useStorage(t, makeBrowserStorage([["tentacle.s09", "shared", 100]], {
    [dos]: [["tentacle.s02", "dos save", 20]], [amiga]: [["tentacle.s03", "amiga save", 30]],
  }));
  const identity = { engineId: "scumm", gameId: "tentacle" };
  const a = { ...identity, target: "tentacle", saveVersionId: "dos" };
  const b = { ...identity, target: "tentacle", saveVersionId: "amiga" };
  await indexSaves(a, [["tentacle.s02", 2]]); await indexSaves(b, [["tentacle.s03", 3]]);
  assert.equal(await getLatestBrowserSave(a, "test"), 2);
  assert.equal(await getLatestBrowserSave(b, "test"), 3);
  assert.equal(await getLatestBrowserSave({ target: "unknown", saveVersionId: "dos" }, "test"), 2);
  assert.equal(await getLatestBrowserSave({ ...a, saveVersionId: "unplayed" }, "test"), null);
});

test("Deleted or changed saves invalidate the index rather than loading a stale slot", async (t) => {
  const game = { target: "tentacle", engineId: "scumm", gameId: "tentacle" };
  useStorage(t, makeBrowserStorage([["tentacle.s02", "player save", 20]]));
  await indexSaves(game, [["tentacle.s02", 2]]);
  const key = saveIndexKey("", game.target), index = window.localStorage.getItem(key);
  window.localStorage = makeBrowserStorage([["tentacle.s02", "modified save", 30]]);
  window.localStorage.setItem(key, index);
  assert.equal(await getLatestBrowserSave(game, "test"), null);
  window.localStorage = makeBrowserStorage([]); window.localStorage.setItem(key, index);
  assert.equal(await getLatestBrowserSave(game, "test"), null);
});

test("Unsupported engines and title exceptions remain on Play even with files", async (t) => {
  useStorage(t, makeBrowserStorage([["save.001", "data", 10]]));
  for (const [engineId, gameId] of [["agos", "simon1"], ["composer", "darby"], ["gob", "gob1"],
    ["made", "rtz"], ["parallaction", "nippon"], ["plumbers", "plumbers"], ["sword25", "sword25"],
    ["agi", "winnie"], ["agi", "mickey"], ["agi", "troll"], ["mohawk", "arthur"]]) {
    const game = { target: gameId, engineId, gameId };
    await indexSaves(game, [["save.001", 1]]);
    assert.equal(await getLatestBrowserSave(game, "test"), null, engineId + ":" + gameId);
  }
});

test("unindexed imported saves use one native query with origin, source and nonce checks", async (t) => {
  const game = { target: "atlantis", gameId: "atlantis", engineId: "scumm", saveVersionId: "query-test" };
  const namespace = await getVersionSaveNamespace(game.saveVersionId);
  game.saveNamespace = namespace;
  useStorage(t, makeBrowserStorage([], { [namespace]: [["atlantis.s01", "player", 123]] }));
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, "document");
  t.after(() => { if (descriptor) Object.defineProperty(globalThis, "document", descriptor); else delete globalThis.document; });
  const listeners = new Set();
  Object.assign(window, { location: { href: "https://example.test/", origin: "https://example.test" },
    setTimeout, clearTimeout, addEventListener: (_, fn) => listeners.add(fn), removeEventListener: (_, fn) => listeners.delete(fn) });
  let appended = 0, removed = 0, queryUrl;
  const frame = { contentWindow: {}, setAttribute() {}, remove: () => removed++ };
  const { files } = await readBrowserSaveFiles(game);
  globalThis.document = {
    createElement: () => frame,
    body: { appendChild: () => {
      appended++;
      queryUrl = new URL(frame.src);
      const data = { type: "scummweb:saves-listed", query: queryUrl.searchParams.get("saveQuery"),
        schemaVersion: 1, engineId: "scumm", gameId: "atlantis", supported: true,
        revision: saveRevision(files), saves: [{ ...files[0], slot: 1 }] };
      window.localStorage.setItem(saveIndexKey(namespace), JSON.stringify(data));
      queueMicrotask(() => {
        for (const receive of [...listeners]) {
          receive({ origin: "https://wrong.test", source: frame.contentWindow, data });
          receive({ origin: window.location.origin, source: {}, data });
          receive({ origin: window.location.origin, source: frame.contentWindow, data: { ...data, query: "wrong" } });
          assert.equal(removed, 0, "untrusted messages must not finish the native query");
          receive({ origin: window.location.origin, source: frame.contentWindow, data });
        }
      });
    } },
  };
  assert.deepEqual(await Promise.all([getLatestBrowserSave(game, "test"), getLatestBrowserSave(game, "test")]), [1, 1]);
  assert.equal(appended, 1); assert.equal(removed, 1); assert.equal(listeners.size, 0);
  assert.equal(queryUrl.searchParams.get("saveNamespace"), namespace);
  assert.equal(queryUrl.searchParams.get("saveEngine"), "scumm");
});

test("an old empty AGS index is reconciled even when the save files have not changed", async (t) => {
  const game = { target: "qfi-demo", gameId: "qfi", engineId: "ags", extra: "Demo 2.0" };
  useStorage(t, makeBrowserStorage([["qfi-demo.001", "player", 123]]));
  const { files } = await readBrowserSaveFiles(game);
  const key = saveIndexKey("", game.target);
  const old = { schemaVersion: 1, ...game, supported: true, saves: [], revision: saveRevision(files) };
  window.localStorage.setItem(key, JSON.stringify(old));
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, "document");
  t.after(() => { if (descriptor) Object.defineProperty(globalThis, "document", descriptor); else delete globalThis.document; });
  const listeners = new Set();
  Object.assign(window, { location: { href: "https://example.test/", origin: "https://example.test" },
    setTimeout, clearTimeout, addEventListener: (_, fn) => listeners.add(fn), removeEventListener: (_, fn) => listeners.delete(fn) });
  let appended = 0;
  const frame = { contentWindow: {}, setAttribute() {}, remove() {} };
  globalThis.document = {
    createElement: () => frame,
    body: { appendChild() {
      appended++;
      const index = { ...old, saves: [{ ...files[0], slot: 1 }] };
      window.localStorage.setItem(key, JSON.stringify(index));
      const data = { ...index, type: "scummweb:saves-listed", persisted: true,
        query: new URL(frame.src).searchParams.get("saveQuery") };
      queueMicrotask(() => {
        for (const receive of [...listeners]) receive({ origin: window.location.origin, source: frame.contentWindow, data });
      });
    } },
  };
  assert.equal(await getLatestBrowserSave(game, "new-runtime"), 1);
  assert.equal(JSON.parse(window.localStorage.getItem(key)).checkedByRuntime, "new-runtime");
  assert.equal(await getLatestBrowserSave(game, "new-runtime"), 1);
  assert.equal(appended, 1);
});

test("cache reads are synchronous and never create a runtime, including missing/corrupt storage", async (t) => {
  const game = { target: "sky", engineId: "sky", gameId: "sky" };
  useStorage(t, makeBrowserStorage([["SKY-VM.001", "player", 20]]));
  assert.equal(getCachedBrowserSave(game), null);
  await indexSaves(game, [["SKY-VM.001", 1]]);
  assert.equal(getCachedBrowserSave(game), 1);
  window.localStorage.setItem(saveIndexKey("", "sky"), "{");
  assert.equal(getCachedBrowserSave(game), null);
  window.localStorage = { getItem() { throw new Error("storage disabled"); } };
  assert.equal(getCachedBrowserSave(game), null);
});

test("changed shared directory and deleted latest save retain other valid indexed saves", async (t) => {
  const game = { target: "sky", engineId: "sky", gameId: "sky" };
  useStorage(t, makeBrowserStorage([["SKY-VM.001", "old", 10], ["SKY-VM.002", "new", 20]]));
  await indexSaves(game, [["SKY-VM.001", 1], ["SKY-VM.002", 2]]);
  const index = window.localStorage.getItem(saveIndexKey("", "sky"));
  window.localStorage = makeBrowserStorage([["SKY-VM.001", "old", 10], ["queen.s01", "other", 30]]);
  window.localStorage.setItem(saveIndexKey("", "sky"), index);
  assert.equal(getCachedBrowserSave(game), 1);
  assert.equal(await getLatestBrowserSave(game, "test"), 1, "failed repair preserves valid entries");
  window.localStorage = makeBrowserStorage([]);
  window.localStorage.setItem(saveIndexKey("", "sky"), index);
  assert.equal(getCachedBrowserSave(game), null);
});

test("pending filenames and catalog identity mismatches cannot reuse cached progress", async (t) => {
  const game = { target: "sky", engineId: "sky", gameId: "sky" };
  useStorage(t, makeBrowserStorage([["SKY-VM.001", "player", 20]]));
  await indexSaves(game, [["SKY-VM.001", 1]]);
  const key = saveIndexKey("", "sky"), index = JSON.parse(window.localStorage.getItem(key));
  window.localStorage.setItem(key, JSON.stringify({ ...index, pending: ["SKY-VM.001"] }));
  assert.equal(getCachedBrowserSave(game), null);
  window.localStorage.setItem(key, JSON.stringify({ ...index, gameId: "queen" }));
  assert.equal(getCachedBrowserSave(game), null);
});

test("cached namespace lookup offers immediate Continue for an unknown import without version leakage", async (t) => {
  const namespace = await getVersionSaveNamespace("cached-import");
  useStorage(t, makeBrowserStorage([], { [namespace]: [["lure.001", "player", 20]] }));
  const game = { target: "unrecognized", saveVersionId: "cached-import" };
  await indexSaves({ ...game, engineId: "lure", gameId: "lure", saveNamespace: namespace }, [["lure.001", 1]]);
  assert.equal(getCachedBrowserSave(game), 1);
  assert.equal(getCachedBrowserSave({ ...game, saveVersionId: "never-opened-import" }), null);
});

test("storage bursts coalesce, unrelated preferences are ignored, and subscriptions clean up", async (t) => {
  useStorage(t, makeBrowserStorage([]));
  const listeners = new Map(), timers = new Map(); let id = 0, notified = 0;
  Object.assign(window, {
    addEventListener: (name, fn) => listeners.set(name, fn), removeEventListener: (name) => listeners.delete(name),
    setTimeout: (fn) => { timers.set(++id, fn); return id; }, clearTimeout: (key) => timers.delete(key),
  });
  const unsubscribe = subscribeBrowserSaves({ target: "sky" }, "test", () => ++notified);
  assert.equal(timers.size, 1);
  for (let i = 0; i < 10; i++) listeners.get("storage")({ key: saveIndexKey("", "sky") });
  assert.equal(timers.size, 1);
  const before = notified;
  listeners.get("storage")({ key: "scummweb.version:sky" });
  assert.equal(notified, before);
  listeners.get("pageshow")(); listeners.get("focus")();
  assert.equal(timers.size, 1);
  unsubscribe();
  assert.equal(timers.size, 0); assert.equal(listeners.size, 0);
});

test("launch cancels an in-flight repair and prevents queued query frames from starting", async (t) => {
  const game = { target: "cancel-test", gameId: "atlantis", engineId: "scumm", saveVersionId: "cancel-test" };
  const namespace = await getVersionSaveNamespace(game.saveVersionId);
  const other = { ...game, saveVersionId: "cancel-queued-test" };
  const otherNamespace = await getVersionSaveNamespace(other.saveVersionId);
  useStorage(t, makeBrowserStorage([], { [namespace]: [["atlantis.s01", "player", 20]],
    [otherNamespace]: [["atlantis.s01", "player", 20]] }));
  const previous = globalThis.document;
  t.after(() => { if (previous === undefined) delete globalThis.document; else globalThis.document = previous; });
  let appended = 0, removed = 0;
  const listeners = new Map();
  Object.assign(window, { location: { href: "https://example.test/", origin: "https://example.test" },
    setTimeout, clearTimeout, addEventListener: (name, fn) => listeners.set(name, fn), removeEventListener: (name) => listeners.delete(name) });
  globalThis.document = { createElement: () => ({ contentWindow: {}, setAttribute() {}, remove: () => ++removed }),
    body: { appendChild: () => ++appended } };
  const request = getLatestBrowserSave(game, "test");
  await new Promise(setImmediate);
  assert.equal(appended, 1);
  const queued = getLatestBrowserSave(other, "test");
  await new Promise(setImmediate);
  cancelBrowserSaveQueries();
  assert.equal(await request, null);
  assert.equal(await queued, null);
  assert.equal(appended, 1);
  assert.equal(removed, 1); assert.equal(listeners.size, 0);
});

test("background reconciliation yields while a game or restore owns the filesystem", async (t) => {
  const game = { target: "locked-query", engineId: "lure", gameId: "lure", saveVersionId: "locked-query" };
  const namespace = await getVersionSaveNamespace(game.saveVersionId);
  useStorage(t, makeBrowserStorage([], { [namespace]: [["lure.001", "player", 20]] }));
  window.navigator = { locks: { query: async () => ({ held: [{ name: "scummweb-saves" }] }) } };
  const previous = globalThis.document;
  t.after(() => { if (previous === undefined) delete globalThis.document; else globalThis.document = previous; });
  globalThis.document = { createElement() { assert.fail("a repair must not boot a competing runtime"); } };
  assert.equal(await getLatestBrowserSave(game, "test"), null);
});
