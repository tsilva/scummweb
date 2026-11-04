import assert from "node:assert/strict";
import test from "node:test";
import { installAudioStartControl } from "../web-shell/audio-start-control.mjs";

function fixture(initialState) {
  const handlers = new Map();
  const callbacks = new Map();
  let context;
  let pending;
  let focused = 0;
  const button = {
    style: {},
    addEventListener: (name, callback) => callbacks.set(name, callback),
    click: () => callbacks.get("click")({ stopPropagation() {} }),
  };
  const document = {
    createElement: () => button,
    body: { appendChild() {} },
    getElementById: () => ({ focus: () => { focused++; } }),
  };
  const window = {
    addEventListener: (name, callback) => handlers.set(name, [...(handlers.get(name) ?? []), callback]),
    removeEventListener: (name, callback) => handlers.set(name, handlers.get(name).filter((item) => item !== callback)),
    setTimeout: (callback) => { pending = callback; return 1; },
    clearTimeout: () => { pending = undefined; },
  };
  const createContext = (state) => {
    context = new EventTarget();
    context.state = state;
    context.resumes = 0;
    context.resume = async () => {
      context.resumes++;
      context.state = "running";
      context.dispatchEvent(new Event("statechange"));
    };
    return context;
  };
  if (initialState) createContext(initialState);
  installAudioStartControl({ document, window, getAudioContext: () => context });
  return {
    button, window, createContext,
    get context() { return context; },
    get focused() { return focused; },
    poll: () => pending?.(),
    dispatch: (name, target, key = "Enter") => {
      let stopped = false;
      const event = { type: name, code: key, target, stopImmediatePropagation: () => { stopped = true; } };
      for (const handler of handlers.get(name) ?? []) {
        if (stopped) break;
        handler(event);
      }
    },
  };
}

test("starting suspended audio resumes its clock and consumes input that would skip a cutscene", async () => {
  const f = fixture("suspended");
  let gameMouseUps = 0;
  f.window.addEventListener("mouseup", () => { gameMouseUps++; });
  assert.equal(f.button.hidden, false);
  f.dispatch("mouseup", f.button);
  assert.equal(gameMouseUps, 0);
  await f.button.click();
  assert.equal(f.context.resumes, 1);
  assert.equal(f.button.hidden, true);
  assert.equal(f.focused, 1);
  f.dispatch("mouseup", {});
  assert.equal(gameMouseUps, 1, "ordinary game input must still reach SDL");
});

test("the activation key-up is consumed after focus has moved into the game", async () => {
  const f = fixture("suspended");
  let gameKeyUps = 0;
  f.window.addEventListener("keyup", () => { gameKeyUps++; });
  f.dispatch("keydown", f.button);
  await f.button.click();
  f.dispatch("keyup", {});
  assert.equal(gameKeyUps, 0);
  f.dispatch("keydown", {});
  f.dispatch("keyup", {});
  assert.equal(gameKeyUps, 1, "later game keystrokes must remain available");
});

test("the control waits for audio initialization, follows state changes, and cleans up", () => {
  const f = fixture();
  assert.equal(f.button.hidden, true);
  const context = f.createContext("running");
  f.poll();
  assert.equal(f.button.hidden, true);
  context.state = "interrupted";
  context.dispatchEvent(new Event("statechange"));
  assert.equal(f.button.hidden, false);
  f.dispatch("pagehide");
  context.state = "running";
  context.dispatchEvent(new Event("statechange"));
  assert.equal(f.button.hidden, false, "unloaded controls must stop observing the context");
});

test("an audio resume rejection leaves a usable retry control", async () => {
  const f = fixture("suspended");
  f.context.resume = async () => { throw new Error("Gesture required"); };
  await f.button.click();
  assert.equal(f.button.hidden, false);
  assert.equal(f.button.textContent, "Try starting audio again");
  assert.equal(f.focused, 0);
});
