import assert from "node:assert/strict";
import test from "node:test";
import { getLatestBrowserSave, readBrowserSaveFiles } from "../app/browser-saves.mjs";
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
