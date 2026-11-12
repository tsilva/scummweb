import assert from "node:assert/strict";
import test from "node:test";
import { watchDialogueChoices } from "../app/game-player/mobile-controls.mjs";

test("dialogue watching follows choices, navigation and inaccessible frames, and cleans up", () => {
  const changes = [];
  let poll;
  let load;
  let active = false;
  const frame = {
    contentWindow: { scummwebPlayerControls: { read: () => ({ dialogueActive: active }) } },
    addEventListener(name, handler) { assert.equal(name, "load"); load = handler; },
    removeEventListener(name, handler) { assert.equal(name, "load"); assert.equal(handler, load); load = null; },
  };
  const stop = watchDialogueChoices(frame, (value) => changes.push(value), {
    setInterval(handler, delay) { assert.equal(delay, 100); poll = handler; return 1; },
    clearInterval(timer) { assert.equal(timer, 1); poll = null; },
  });
  assert.deepEqual(changes, [false]);
  active = true;
  poll();
  poll();
  assert.deepEqual(changes, [false, true]);
  frame.contentWindow = {};
  load();
  assert.deepEqual(changes, [false, true, false]);
  frame.contentWindow = { scummwebPlayerControls: { read: () => ({ dialogueActive: true }) } };
  load();
  Object.defineProperty(frame, "contentWindow", { get() { throw new Error("Navigating"); } });
  poll();
  assert.deepEqual(changes, [false, true, false, true, false]);
  stop();
  assert.equal(poll, null);
  assert.equal(load, null);
});
