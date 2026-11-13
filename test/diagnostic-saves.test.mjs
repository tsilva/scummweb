import assert from "node:assert/strict";
import test from "node:test";
import { installDiagnosticSaves } from "../web-shell/diagnostic-saves.mjs";
import { installPlayerControls } from "../web-shell/player-controls.mjs";
import { installContinueSaves, defaultSavePath } from "../web-shell/continue-saves.mjs";

function fixture(supported = true) {
  const files = new Map([[`${defaultSavePath}/game.001`, new Uint8Array([7, 8, 9])]]);
  const directories = new Set([defaultSavePath]);
  const storage = new Map([["unrelated", "unchanged"]]);
  const timers = new Map();
  let nextTimer = 0;
  const scope = {
    localStorage: { getItem: (key) => storage.get(key), setItem: (key, value) => storage.set(key, value) },
    parent: { postMessage() {} },
    fetch: async () => ({ ok: false, json: async () => ({}) }),
    setInterval: () => 1,
    clearInterval() {},
    addEventListener() {},
    setTimeout(callback) { const id = ++nextTimer; timers.set(id, callback); return id; },
    clearTimeout: (id) => timers.delete(id),
    Module: { _scummweb_diagnostic_saves_supported: () => Number(supported) },
  };
  const FS = {
    mkdir(path) { if (directories.has(path)) throw new Error(); directories.add(path); },
    rmdir: (path) => directories.delete(path),
    readdir(path) {
      if (!directories.has(path)) throw new Error();
      return [".", "..", ...[...files.keys()].filter((name) => name.startsWith(path + "/")).map((name) => name.slice(path.length + 1))];
    },
    stat(path) { return { size: files.get(path).length, mtime: 42, mode: 1 }; },
    isFile: () => true,
    readFile: (path) => files.get(path),
    unlink: (path) => files.delete(path),
  };
  installPlayerControls(scope);
  installDiagnosticSaves(scope, FS, scope.Module);
  installContinueSaves({ scope, FS, Module: scope.Module,
    launchUrl: new URL("https://example.test/scummvm.html?catalogGame=game"), assetUrl: (url) => url });
  scope.__scummwebBeginSaveScan("scumm", "monkey", "game", true);
  scope.__scummwebAddSave(1, "game.001", "Player save", true);
  scope.__scummwebEndSaveScan();
  const controls = scope.scummwebPlayerControls;
  controls.setMenuOpen(true);
  scope.__scummwebAgentFrameBoundary(true, 2, 2, true, true);
  return { scope, FS, controls, files, directories, storage, timers };
}

test("report snapshots capture all native companion files without modifying player saves or Continue", async () => {
  const { scope, controls, files, directories, storage } = fixture();
  const previousStorage = [...storage];
  const previousSaves = controls.read().saves;
  const result = controls.run("report");
  assert.equal(scope.__scummwebDiagnosticSaves.active, false, "isolation starts at native dispatch");
  assert.equal(scope.__scummwebAgentFrameBoundary(false, 2, 2, true, true), 1,
    "a full player library does not block an isolated diagnostic slot");
  assert.equal(scope.__scummwebDiagnosticSaves.active, true);
  assert.equal(scope.__scummwebPlayerSaveCaption(1), "Bug report");
  for (const name of ["game.001", "game.001.meta"]) {
    assert.equal(scope.__scummwebBeginSaveWrite(name), true);
    files.set(`/tmp/scummweb-bug-report/${name}`, new Uint8Array([1, 2, 3]));
    assert.equal(scope.__scummwebEndSaveWrite(name, true), false, "no player-save refresh");
  }
  scope.__scummwebAgentSaveResult(null);
  const capture = await result;
  assert.equal(capture.status, "captured");
  assert.deepEqual(capture.files.map(({ name }) => name), ["game.001", "game.001.meta"]);
  assert.deepEqual([...capture.files[0].data], [1, 2, 3]);
  assert.deepEqual([...files], [[`${defaultSavePath}/game.001`, new Uint8Array([7, 8, 9])]]);
  assert.deepEqual([...storage], previousStorage);
  assert.deepEqual(controls.read().saves, previousSaves);
  assert.equal(directories.has("/tmp/scummweb-bug-report"), false);
});

test("older runtime and unsupported saving never dispatch a normal player save", async () => {
  const { scope, controls, directories } = fixture(false);
  assert.deepEqual(await controls.run("report"), { status: "unavailable", files: [] });
  assert.equal(scope.__scummwebAgentFrameBoundary(false, 2, 2, true, true), -1);
  assert.equal(directories.has("/tmp/scummweb-bug-report"), false);
});

test("a dispatched timeout keeps the native output isolated until the late acknowledgement", async () => {
  const { scope, controls, files, timers } = fixture();
  const result = controls.run("report");
  scope.__scummwebAgentFrameBoundary(false, 2, 2, true, true);
  for (const timeout of timers.values()) timeout();
  assert.equal((await result).status, "timeout");
  assert.equal(scope.__scummwebDiagnosticSaves.active, true);
  assert.ok(controls.run("save", null).error);
  scope.__scummwebBeginSaveWrite("game.001");
  files.set("/tmp/scummweb-bug-report/game.001", new Uint8Array([4]));
  scope.__scummwebEndSaveWrite("game.001", true);
  scope.__scummwebAgentSaveResult(null);
  assert.equal(scope.__scummwebDiagnosticSaves.active, false);
  assert.deepEqual([...files.get(`${defaultSavePath}/game.001`)], [7, 8, 9]);
});

test("failed, oversized, unsafe, and empty native outputs are discarded", async () => {
  for (const mode of ["failed", "oversized", "unsafe", "empty"]) {
    const { scope, controls, files, storage } = fixture();
    const before = [...storage];
    const result = controls.run("report");
    scope.__scummwebAgentFrameBoundary(false, 2, 2, true, true);
    if (mode === "unsafe") assert.equal(scope.__scummwebBeginSaveWrite("../player-save"), false);
    else if (mode !== "empty") {
      scope.__scummwebBeginSaveWrite("game.001");
      files.set("/tmp/scummweb-bug-report/game.001", new Uint8Array(mode === "oversized" ? 2097153 : 1));
      scope.__scummwebEndSaveWrite("game.001", mode !== "failed");
    }
    scope.__scummwebAgentSaveResult(null);
    assert.equal((await result).status, "failed", mode);
    assert.deepEqual([...storage], before);
    assert.equal(files.size, 1);
  }
});
