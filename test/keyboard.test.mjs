import assert from "node:assert/strict";
import test from "node:test";
import { dispatchGameCommand, dispatchHugoCommand, dispatchSyntheticKeypress, dispatchSyntheticKeypressSequence, holdGameKey } from "../app/game-player/keyboard.js";

function fixture({ canvas = true } = {}) {
  class KeyboardEvent extends Event {
    constructor(type, init) {
      super(type, init);
      for (const name of ["key", "code", "keyCode", "which", "charCode", "ctrlKey", "altKey", "metaKey", "shiftKey"]) {
        this[name] = init[name];
      }
    }
  }
  // Model the DOM ancestor chain so duplicated dispatches are observable at SDL's listener.
  class Target extends EventTarget {
    constructor(parent) { super(); this.parent = parent; this.received = []; }
    focus() { document.activeElement = this; }
    dispatchEvent(event) {
      this.received.push(event);
      const accepted = super.dispatchEvent(event);
      if (event.bubbles) this.parent?.dispatchEvent(event);
      return accepted;
    }
  }
  const window = new Target();
  window.KeyboardEvent = KeyboardEvent;
  const document = new Target(window);
  document.body = new Target(document);
  document.canvas = canvas ? new Target(document.body) : null;
  document.activeElement = document.body;
  document.getElementById = () => document.canvas;
  return { contentWindow: window, contentDocument: document };
}

test("one shortcut reaches each ancestor listener exactly once per event", () => {
  const frame = fixture();
  assert.equal(dispatchSyntheticKeypress(frame, "g"), true);
  const { canvas, body, activeElement } = frame.contentDocument;
  assert.equal(activeElement, canvas);
  for (const target of [canvas, body, frame.contentDocument, frame.contentWindow]) {
    assert.deepEqual(target.received.map(({ type }) => type), ["keydown", "keypress", "keyup"]);
  }
  assert.equal(frame.contentWindow.received[1].charCode, 71);
});

test("menu shortcuts preserve function keys and modifiers with a body fallback", () => {
  const frame = fixture({ canvas: false });
  dispatchSyntheticKeypress(frame, { key: "F5", ctrlKey: true });
  assert.equal(frame.contentWindow.received.length, 3);
  for (const event of frame.contentWindow.received) {
    assert.equal(event.key, "F5");
    assert.equal(event.code, "F5");
    assert.equal(event.keyCode, 116);
    assert.equal(event.ctrlKey, true);
    assert.equal(event.charCode, 0);
  }
});

test("explicit repeated shortcuts send the configured number of presses", async () => {
  const frame = fixture();
  await dispatchSyntheticKeypressSequence(frame, { key: "Escape", pressCount: 2 });
  assert.deepEqual(frame.contentWindow.received.map(({ type }) => type),
    ["keydown", "keypress", "keyup", "keydown", "keypress", "keyup"]);
  assert.equal(dispatchSyntheticKeypress(null, "Escape"), false);
});

test("game commands send each key to SDL in order, including spaces and Enter", () => {
  const frame = fixture();
  assert.equal(dispatchGameCommand(frame, "go east!"), true);
  assert.deepEqual(frame.contentWindow.received
    .filter(({ type }) => type === "keydown").map(({ key, code }) => [key, code]), [
    ["G", "KeyG"], ["O", "KeyO"], [" ", "Space"], ["E", "KeyE"], ["A", "KeyA"],
    ["S", "KeyS"], ["T", "KeyT"], ["!", "Digit1"], ["Enter", "Enter"],
  ]);
  assert.equal(frame.contentWindow.received.at(-1).keyCode, 13);

  const empty = fixture();
  assert.equal(dispatchGameCommand(empty, ""), true);
  assert.deepEqual(empty.contentWindow.received.map(({ key }) => key), ["Enter", "Enter", "Enter"]);
});

test("held movement keeps the key down and releases it on the original canvas", () => {
  const frame = fixture();
  const canvas = frame.contentDocument.canvas;
  const release = holdGameKey(frame, { key: "ArrowUp", keyCode: 38 });
  assert.deepEqual(canvas.received.map(({ type }) => type), ["keydown"]);
  frame.contentDocument.canvas = null;
  release();
  assert.deepEqual(canvas.received.map(({ type, code }) => [type, code]),
    [["keydown", "ArrowUp"], ["keyup", "ArrowUp"]]);
});

test("long Hugo commands arrive in batches with Enter at the end", async () => {
  const frame = fixture();
  const command = "use the long wooden ladder";
  const sending = dispatchHugoCommand(frame, command, new AbortController().signal);
  const sentKeys = () => frame.contentWindow.received.filter(({ type }) => type === "keydown").map(({ key }) => key);
  assert.equal(sentKeys().join(""), command.slice(0, 16).toUpperCase());
  assert.equal(await sending, true);
  assert.deepEqual(sentKeys(), [...command.toUpperCase(), "Enter"]);
});
