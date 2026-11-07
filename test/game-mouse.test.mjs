import assert from "node:assert/strict";
import test from "node:test";
import { observeRemoteMouse } from "../app/game-player/game-mouse.mjs";

function sendKey(target, type, key, options = {}) {
  const event = Object.assign(new Event(type, { cancelable: true }), { key, ...options });
  return target.dispatchEvent(event);
}

test("the TV remote moves and clicks once across game iframe reloads", () => {
  const host = Object.assign(new EventTarget(), { location: new URL("https://scummweb.example/") });
  const inputs = [];
  const frame = Object.assign(new EventTarget(), {
    contentDocument: new EventTarget(),
    contentWindow: { postMessage: (message, origin) => inputs.push({ ...message, origin }) },
  });
  const dispose = observeRemoteMouse(host, frame);
  const original = frame.contentDocument;
  assert.equal(sendKey(original, "keydown", "ArrowLeft"), false);
  assert.equal(sendKey(original, "keydown", "ArrowLeft"), false);
  assert.equal(sendKey(original, "keyup", "ArrowLeft"), false);
  assert.equal(sendKey(host, "keydown", "Enter", { ctrlKey: true }), true);
  frame.contentDocument = new EventTarget();
  frame.dispatchEvent(new Event("load"));
  assert.equal(sendKey(original, "keydown", "Enter"), true);
  assert.equal(sendKey(frame.contentDocument, "keydown", "Enter"), false);
  assert.equal(sendKey(frame.contentDocument, "keyup", "Enter"), false);
  assert.equal(sendKey(frame.contentDocument, "keydown", "Enter"), false);
  assert.equal(sendKey(frame.contentDocument, "keydown", "Enter"), false);
  assert.equal(sendKey(frame.contentDocument, "keyup", "Enter"), false);
  dispose();
  assert.equal(sendKey(frame.contentDocument, "keydown", "Enter"), true);
  assert.deepEqual(inputs, [
    { type: "scummweb-touch-cursor-pad", deltaX: -7, deltaY: 0, origin: host.location.origin },
    { type: "scummweb-touch-cursor-pad", deltaX: -18, deltaY: 0, origin: host.location.origin },
    { type: "scummweb-touch-click", button: "left", origin: host.location.origin },
    { type: "scummweb-touch-click", button: "right", origin: host.location.origin },
  ]);
});
