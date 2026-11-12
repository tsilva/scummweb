import assert from "node:assert/strict";
import test from "node:test";
import { installPlayerControls } from "../web-shell/player-controls.mjs";

function createPlayer() {
  const storage = new Map();
  const timers = new Map();
  let nextTimer = 0;
  const scope = {
    localStorage: { getItem: (key) => storage.get(key), setItem: (key, value) => storage.set(key, value) },
    setTimeout(callback) {
      const id = ++nextTimer;
      timers.set(id, callback);
      return id;
    },
    clearTimeout: (id) => timers.delete(id),
  };
  installPlayerControls(scope);
  return { scope, storage, timers, controls: scope.scummwebPlayerControls };
}

test("dialogue choices are inactive until the native handler reports them and reset for every launch", () => {
  const { scope, controls } = createPlayer();
  assert.equal(controls.read().dialogueActive, false);
  scope.__scummwebSetDialogueActive(true);
  assert.equal(controls.read().dialogueActive, true);
  scope.__scummwebSetDialogueActive(false);
  assert.equal(controls.read().dialogueActive, false);
  scope.__scummwebSetDialogueActive(true);
  assert.equal(createPlayer().controls.read().dialogueActive, false);
});

test("hosted save operations honor occupied slots, autosaves, and native confirmation", async () => {
  const { scope, controls } = createPlayer();
  const boundary = () => scope.__scummwebAgentFrameBoundary(true, 8, 2, true, true);
  const saves = [
    { slot: 0, name: "game.000", writable: false, description: "Autosave", modifiedAt: 11 },
    { slot: 4, name: "game.004", writable: true, description: "Factory", modifiedAt: 22 },
  ];
  scope.__scummwebPublishPlayerSaves(saves, [0, 1, 4]);
  assert.equal(boundary(), 0);
  controls.setMenuOpen(true);
  assert.equal(boundary(), -1);
  assert.equal(controls.read().nextSlot, 3);
  assert.deepEqual(controls.read().saves.map(({ slot }) => slot), [4, 0]);
  assert.ok(controls.run("save", 0).error);

  const unconfirmed = controls.run("save", null);
  assert.equal(boundary(), 3);
  assert.equal(scope.__scummwebPlayerSaveCaption(3), "Save 3");
  assert.equal(scope.__scummwebPlayerIsNewSave(), true);
  scope.__scummwebAgentSaveResult(null);
  assert.ok((await unconfirmed).error);

  const failedOverwrite = controls.run("save", 4);
  assert.equal(boundary(), 4);
  scope.__scummwebAgentSaveResult(null);
  assert.ok((await failedOverwrite).error);

  const overwrite = controls.run("save", 4);
  assert.equal(boundary(), 4);
  assert.equal(scope.__scummwebPlayerSaveCaption(4), "Factory");
  scope.__scummwebPlayerSaveWritten("game.004");
  scope.__scummwebAgentSaveResult(null);
  assert.deepEqual(await overwrite, { slot: 4 });

  const load = controls.run("load", 0);
  assert.equal(boundary(), 17);
  assert.equal(boundary(), -1);
  scope.__scummwebAgentSaveResult(null);
  assert.deepEqual(await load, { slot: 0 });
  controls.setMenuOpen(false);
  assert.equal(boundary(), 0);
});

test("a timed-out dispatched load cannot complete a newer request", async () => {
  const { scope, controls, timers } = createPlayer();
  scope.__scummwebPublishPlayerSaves([{ slot: 4 }], [4]);
  controls.setMenuOpen(true);
  scope.__scummwebAgentBoundary(true, 8);
  const first = controls.run("load", 4);
  assert.equal(scope.__scummwebAgentBoundary(true, 8), 12);
  for (const timeout of timers.values()) timeout();
  assert.match((await first).error, /did not respond/);
  assert.ok(controls.run("load", 4).error);
  scope.__scummwebAgentSaveResult(null);
  const second = controls.run("load", 4);
  scope.__scummwebAgentBoundary(true, 8);
  scope.__scummwebAgentSaveResult(null);
  assert.deepEqual(await second, { slot: 4 });
});

test("speed changes preserve a continuous clock and volume resumes at the selected gain", () => {
  const { scope, controls } = createPlayer();
  assert.equal(scope.__scummwebPlayerMillis(100), 100);
  controls.setSettings({ speed: 1.5, volume: 30 });
  assert.equal(scope.__scummwebPlayerMillis(200), 250);
  assert.equal(scope.__scummwebPlayerDelay(120), 80);
  assert.equal(scope.__scummwebPlayerVolume, 0.3);
  controls.setMenuOpen(true);
  assert.equal(scope.__scummwebPlayerVolume, 0);
  controls.setSettings({ speed: 0.5, volume: 45 });
  assert.equal(scope.__scummwebPlayerMillis(300), 300);
  assert.equal(scope.__scummwebPlayerDelay(120), 240);
  controls.setMenuOpen(false);
  assert.equal(scope.__scummwebPlayerVolume, 0.45);
  assert.equal(controls.read().volume, 45);
  assert.equal(controls.read().speed, 0.5);
});

test("each launch starts at full volume and normal speed despite older browser settings", () => {
  const { scope, storage, controls } = createPlayer();
  const legacySettings = JSON.stringify({ volume: 25, speed: 0.5 });
  const key = "scummweb.player-controls.v1";
  storage.set(key, legacySettings);
  controls.setSettings({ volume: 45, speed: 1.5 });

  const nextLaunch = { localStorage: scope.localStorage };
  installPlayerControls(nextLaunch);
  assert.equal(nextLaunch.scummwebPlayerControls.read().volume, 100);
  assert.equal(nextLaunch.scummwebPlayerControls.read().speed, 1);
  assert.equal(nextLaunch.__scummwebPlayerVolume, 1);
  assert.equal(nextLaunch.__scummwebPlayerDelay(120), 120);
  assert.equal(storage.get(key), legacySettings);
});

test("Escape opens the shared drawer and is consumed before it reaches SDL", () => {
  const { scope } = createPlayer();
  const listeners = new Map();
  scope.addEventListener = (type, callback, capture) => {
    assert.equal(capture, true);
    listeners.set(type, callback);
  };
  let requests = 0;
  installPlayerControls(scope, () => requests++);

  function press(type, overrides = {}) {
    let intercepted = 0;
    listeners.get(type)({
      type, key: "Escape", isTrusted: true,
      preventDefault: () => intercepted++,
      stopImmediatePropagation: () => intercepted++,
      ...overrides,
    });
    return intercepted;
  }

  assert.equal(press("keydown"), 0);
  scope.__scummwebReadyState = { state: "ready" };
  assert.equal(press("keydown", { isTrusted: false }), 0);
  assert.equal(press("keydown", { shiftKey: true }), 0);
  assert.equal(press("keydown"), 2);
  assert.equal(press("keydown", { repeat: true }), 2);
  assert.equal(press("keyup"), 2);
  assert.equal(requests, 1);
});
