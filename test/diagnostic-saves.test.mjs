import assert from "node:assert/strict";
import test from "node:test";
import { installDiagnosticSaves } from "../web-shell/diagnostic-saves.mjs";
import { installPlayerControls } from "../web-shell/player-controls.mjs";
import { installContinueSaves, defaultSavePath } from "../web-shell/continue-saves.mjs";
import { encodeAutosave } from "../web-shell/rotating-autosaves.mjs";

function fixture(supported = true, query = "") {
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
    writeFile: (path, contents) => files.set(path, contents),
    unlink: (path) => files.delete(path),
  };
  installPlayerControls(scope);
  installDiagnosticSaves(scope, FS, scope.Module);
  installContinueSaves({ scope, FS, Module: scope.Module,
    launchUrl: new URL(`https://example.test/scummvm.html?catalogGame=game${query}`), assetUrl: (url) => url });
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

test("Load Game can select either autosave sharing a manual slot and restores its own companion files", async () => {
  const { scope, controls, files, directories, storage } = fixture(true, "&hostPlayer=1&dropbox=true");
  const [older, newer, corrupt] = [0, 1, 2].map(index => `.scummweb-autosave.${index}`);
  for (const [name, savedAt] of [[older, 100], [newer, 200]]) {
    files.set(`${defaultSavePath}/${name}`, encodeAutosave({
      engineId: "scumm", gameId: "monkey", target: "game", savedAt, slot: 1,
      files: [
        { name: "game.001", data: new Uint8Array([savedAt]) },
        { name: "game.001.meta", data: new Uint8Array([savedAt + 1]) },
      ],
    }));
  }
  files.set(`${defaultSavePath}/${corrupt}`, "corrupt");
  const directory = "/tmp/scummweb-bug-report";
  const before = [...files];
  const indexBefore = [...storage];
  const boundary = () => scope.__scummwebAgentFrameBoundary(false, 2, 2, true, true);
  const loadEntries = controls.read({ includeAutosaves: true }).saves;
  assert.deepEqual(loadEntries.map(({ checkpoint, name }) => checkpoint ?? name), [newer, older, "game.001"]);
  assert.deepEqual(controls.read().saves.map(({ name }) => name), ["game.001"]);
  assert.equal(controls.run("save", older).error, "This save slot is unavailable.");
  assert.equal(controls.run("load", corrupt).error, "This save is unavailable.");

  for (const [name, savedAt, error] of [[older, 100, null], [newer, 200, "Native load failed"]]) {
    const result = controls.run("load", name);
    assert.equal(scope.__scummwebDiagnosticSaves.active, false);
    assert.equal(boundary(), 3);
    assert.equal(boundary(), -1, "keep the staged files until native load completes");
    assert.equal(scope.__scummwebDiagnosticSaves.active, true);
    assert.deepEqual([...files.get(`${directory}/game.001`)], [savedAt]);
    assert.deepEqual([...files.get(`${directory}/game.001.meta`)], [savedAt + 1]);
    scope.__scummwebAgentSaveResult(error);
    assert.deepEqual(await result, error ? { error } : { slot: 1 });
    assert.equal(scope.__scummwebDiagnosticSaves.active, false);
    assert.equal(directories.has(directory), false);
    assert.deepEqual([...files], before);
    assert.deepEqual([...storage], indexBefore);
  }

  const manualLoad = controls.run("load", 1);
  assert.equal(boundary(), 3);
  assert.equal(scope.__scummwebDiagnosticSaves.active, false);
  scope.__scummwebAgentSaveResult(null);
  assert.deepEqual(await manualLoad, { slot: 1 });
});

test("older runtime and unsupported saving never dispatch a normal player save", async () => {
  const { scope, controls, directories } = fixture(false);
  assert.deepEqual(await controls.run("report"), { status: "unavailable", files: [], reason: "runtime-unavailable" });
  assert.equal(scope.__scummwebAgentFrameBoundary(false, 2, 2, true, true), -1);
  assert.equal(directories.has("/tmp/scummweb-bug-report"), false);
});

test("backed-up slots use the native list and load their original companion files in isolation", async () => {
  const { scope, controls, files, directories, storage, FS } = fixture();
  const directory = "/tmp/scummweb-bug-report";
  const before = [...files];
  const indexBefore = [...storage];
  assert.equal(controls.read().canLoadBackups, false, "older runtime has no backup picker");
  scope.__scummwebPublishPlayerSaves(controls.read().saves, new Set([1]));
  scope.Module._scummweb_list_isolated_saves = (list) => {
    assert.equal(scope.__scummwebDiagnosticSaves.active, true);
    if (!list) return;
    assert.equal(files.get(`${directory}/game.001`)[0], 3);
    scope.__scummwebBeginSaveScan("scumm", "monkey", "game", true);
    scope.__scummwebRecordOccupiedSave(2);
    scope.__scummwebAddSave(1, "game.001", "Earlier save", true);
    scope.__scummwebAddSave(2, "game.002", "Missing save", true);
    scope.__scummwebEndSaveScan();
  };
  const backup = [
    { path: "game.001", data: new Uint8Array([3, 4]), modifiedAt: 100 },
    { path: "index/companion", data: new Uint8Array([5, 6]), modifiedAt: 100 },
  ];
  assert.equal(controls.read().canLoadBackups, true);
  assert.deepEqual(controls.listBackup(backup), [
    { slot: 1, name: "game.001", description: "Earlier save", modifiedAt: 100 },
  ]);
  assert.equal(controls.read().saves[0].description, "Player save");
  assert.deepEqual([...files], before);
  assert.deepEqual([...storage], indexBefore);

  const boundary = () => scope.__scummwebAgentFrameBoundary(false, 2, 0, true, true);
  for (const error of ["Native load failed", null]) {
    const result = controls.run("load", { slot: 1, files: backup });
    assert.equal(boundary(), 3);
    assert.deepEqual([...files.get(`${directory}/index/companion`)], [5, 6]);
    scope.__scummwebAgentSaveResult(error);
    assert.deepEqual(await result, error ? { error } : { slot: 1 });
    assert.equal(directories.has(directory), false);
    assert.equal(directories.has(directory + "/index"), false);
    assert.deepEqual([...files], before);
    assert.deepEqual([...storage], indexBefore);
  }
  assert.equal(controls.read().nextSlot, 2);
  const nextSave = controls.run("save", null);
  assert.equal(boundary(), 2, "ordinary saving resumes in the next free slot");
  assert.equal(scope.__scummwebDiagnosticSaves.active, false);
  scope.__scummwebAgentSaveResult("Test ends before native write");
  assert.deepEqual(await nextSave, { error: "Test ends before native write" });

  const write = FS.writeFile;
  FS.writeFile = (path, bytes) => {
    write(path, bytes);
    if (path.endsWith("/index/companion")) throw new Error("Partial write");
  };
  assert.equal(controls.listBackup(backup), null);
  assert.equal(directories.has(directory), false);
  assert.deepEqual([...files], before);
  FS.writeFile = write;
  assert.equal(controls.listBackup(backup)[0].slot, 1, "failed staging leaves the temporary path reusable");
});

test("consecutive reports reset the native filename cache even without resuming gameplay", async () => {
  const { scope, controls, files, FS, storage } = fixture();
  const before = [...storage];
  // DefaultSaveFileManager::assureCached refreshes only when getSavePath changes.
  // Removing/recreating a MEMFS directory does not invalidate its filename cache.
  let cachedPath;
  let cachedNames;
  const listing = () => {
    const directory = scope.__scummwebDiagnosticSaves.active ? "/tmp/scummweb-bug-report" : defaultSavePath;
    if (cachedPath !== directory) {
      cachedPath = directory;
      cachedNames = new Set(FS.readdir(directory));
    }
    return cachedNames;
  };
  scope.Module._scummweb_refresh_saves = () => {
    assert.equal(scope.__scummwebDiagnosticSaves.active, false, "refresh only after leaving isolation");
    listing();
  };
  for (let attempt = 0; attempt < 3; attempt++) {
    const result = controls.run("report");
    scope.__scummwebAgentFrameBoundary(false, 2, 2, true, true);
    const names = listing();
    if (names.has("game.001")) {
      scope.__scummwebAgentSaveResult("Save ID is unavailable in this run");
    } else {
      scope.__scummwebBeginSaveWrite("game.001");
      files.set("/tmp/scummweb-bug-report/game.001", new Uint8Array([attempt + 1]));
      names.add("game.001");
      scope.__scummwebEndSaveWrite("game.001", true);
      scope.__scummwebAgentSaveResult(null);
    }
    const capture = await result;
    assert.equal(capture.status, "captured", `report ${attempt + 1}`);
    assert.deepEqual([...capture.files[0].data], [attempt + 1]);
    assert.deepEqual([...files], [[`${defaultSavePath}/game.001`, new Uint8Array([7, 8, 9])]]);
    assert.deepEqual([...storage], before);
  }
});

test("native rejections record bounded reasons without sending raw error text", async () => {
  for (const [error, reason] of [["Save ID is unavailable in this run", "slot-unavailable"],
    ["Cannot save in the current scene", "native-save-rejected"],
    ["Write failed: /private/personal-file.zip", "native-save-rejected"]]) {
    const { scope, controls } = fixture();
    const result = controls.run("report");
    scope.__scummwebAgentFrameBoundary(false, 2, 2, true, true);
    scope.__scummwebAgentSaveResult(error);
    assert.deepEqual(await result, { status: "unavailable", files: [], reason, slot: 1 });
  }
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
