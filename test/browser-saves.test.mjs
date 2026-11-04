import assert from "node:assert/strict";
import test from "node:test";
import { getLatestBrowserSave } from "../app/browser-saves.mjs";
import { getVersionSaveNamespace } from "../app/game-versions.mjs";

function makeBrowserStorage(files, namespaces = {}) {
  const values = new Map();

  function put(key, mode, contents, modifiedAt = 0) {
    const dataKey = `data-${key}`;
    const inode = Buffer.alloc(30);
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
  return { getItem: (key) => values.get(key) ?? null };
}

test("Continue chooses the newest player save by write time and excludes a bundled checkpoint", async (t) => {
  const game = { target: "sky", skipIntro: { saveFiles: ["SKY-VM.000"] } };
  t.mock.method(globalThis, "fetch", async () => new Response("bundled intro"));
  const windowDescriptor = Object.getOwnPropertyDescriptor(globalThis, "window");
  t.after(() => {
    if (windowDescriptor) Object.defineProperty(globalThis, "window", windowDescriptor);
    else delete globalThis.window;
  });

  globalThis.window = { localStorage: makeBrowserStorage([
    ["SKY-VM.000", "bundled intro", 50],
    ["SKY-VM.007", "older save", 10],
    ["SKY-VM.002", "newer save", 30],
    ["queen.s09", "another game's save", 60],
  ]) };
  assert.equal(await getLatestBrowserSave(game, "test"), 2);

  window.localStorage = makeBrowserStorage([["SKY-VM.000", "actual autosave", 70]]);
  assert.equal(await getLatestBrowserSave(game, "test"), 0);

  window.localStorage = makeBrowserStorage([["SKY-VM.000", "bundled intro", 50]]);
  assert.equal(await getLatestBrowserSave(game, "test"), null);
  assert.equal(await getLatestBrowserSave({ target: "nippon-amiga" }, "test"), null);
});

test("Continue only reads saves belonging to the selected imported version and preserves legacy access", async (t) => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, "window");
  t.after(() => {
    if (previous) Object.defineProperty(globalThis, "window", previous);
    else delete globalThis.window;
  });
  const dos = await getVersionSaveNamespace("dos");
  const amiga = await getVersionSaveNamespace("amiga");
  globalThis.window = { localStorage: makeBrowserStorage([["SKY-VM.009", "old shared save", 100]], {
    [dos]: [["SKY-VM.002", "dos save", 20]],
    [amiga]: [["SKY-VM.003", "amiga save", 30]],
  }) };
  assert.equal(await getLatestBrowserSave({ target: "sky", saveVersionId: "dos" }, "test"), 2);
  assert.equal(await getLatestBrowserSave({ target: "sky", saveVersionId: "amiga" }, "test"), 3);
  assert.equal(await getLatestBrowserSave({ target: "sky", saveVersionId: "unplayed" }, "test"), null);
  assert.equal(await getLatestBrowserSave({ target: "sky" }, "test"), 9);
});
