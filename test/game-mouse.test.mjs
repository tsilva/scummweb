import assert from "node:assert/strict";
import test from "node:test";
import { observeRemotePlayerInput } from "../app/game-player/game-mouse.mjs";

function sendKey(target, type, key, options = {}, element) {
  const event = Object.assign(new Event(type, { cancelable: true }), { key, ...options });
  if (element) Object.defineProperty(event, "target", { value: element });
  return target.dispatchEvent(event);
}

function createPlayer() {
  let now = 0;
  const document = Object.assign(new EventTarget(), { hasFocus: () => true });
  const host = Object.assign(new EventTarget(), {
    document,
    location: new URL("https://scummweb.example/"),
    performance: { now: () => now },
    setTimeout,
    clearTimeout,
  });
  const inputs = [];
  const frame = Object.assign(new EventTarget(), {
    contentDocument: new EventTarget(),
    contentWindow: { postMessage: (message) => inputs.push(message) },
  });
  return { host, frame, inputs, advance: (duration) => { now += duration; } };
}

test("holding a direction moves the cursor until release without depending on key repeat", (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const { host, frame, inputs } = createPlayer();
  const dispose = observeRemotePlayerInput(host, frame);
  const original = frame.contentDocument;
  sendKey(original, "keydown", "ArrowUp");
  sendKey(original, "keyup", "ArrowUp");
  sendKey(original, "keydown", "ArrowUp");
  sendKey(original, "keydown", "ArrowUp");
  assert.deepEqual(inputs.map(({ deltaY }) => deltaY), [-7, -7]);
  t.mock.timers.tick(220);
  t.mock.timers.tick(35);
  sendKey(original, "keyup", "ArrowUp");
  t.mock.timers.tick(220);
  assert.deepEqual(inputs.map(({ deltaY }) => deltaY), [-7, -7, -12, -12]);

  sendKey(original, "keydown", "ArrowLeft");
  frame.contentDocument = new EventTarget();
  frame.dispatchEvent(new Event("load"));
  t.mock.timers.tick(250);
  assert.equal(sendKey(original, "keydown", "ArrowLeft"), true);
  assert.equal(inputs.length, 5, "the previous frame's hold is canceled");
  dispose();
});

test("OK taps left-click and holds of either length right-click", () => {
  const { host, frame, inputs, advance } = createPlayer();
  const dispose = observeRemotePlayerInput(host, frame);
  const doc = frame.contentDocument;
  assert.equal(sendKey(host, "keydown", "Enter", { ctrlKey: true }), true);
  for (const duration of [120, 600, 1500]) {
    assert.equal(sendKey(doc, "keydown", "Enter"), false);
    advance(duration);
    assert.equal(sendKey(doc, "keyup", "Enter"), false);
  }
  assert.deepEqual(inputs.map(({ button }) => button), ["left", "right", "right"]);
  dispose();
});

test("focused player buttons keep native OK activation", () => {
  const { host, frame, inputs } = createPlayer();
  const button = { closest: (selector) => selector === "a[href], button" ? button : null };
  const dispose = observeRemotePlayerInput(host, frame);
  assert.equal(sendKey(host, "keydown", "Enter", {}, button), true);
  assert.equal(sendKey(host, "keyup", "Enter", {}, button), true);
  assert.deepEqual(inputs, []);
  dispose();
});
