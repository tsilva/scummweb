import assert from "node:assert/strict";
import test from "node:test";
import { observeControlVisibility } from "../app/game-player/control-visibility.mjs";

function player(menuShortcut, { initiallyCaptured = false } = {}) {
  const host = new EventTarget();
  host.documentElement = new EventTarget();
  const game = new EventTarget();
  game.documentElement = new EventTarget();
  const canvas = new EventTarget();
  canvas.getBoundingClientRect = () => ({ left: 200, top: 0, right: 1000, bottom: 700 });
  game.getElementById = (id) => id === "canvas" ? canvas : null;
  if (initiallyCaptured) game.pointerLockElement = {};
  const controls = new EventTarget();
  controls.ownerDocument = host;
  controls.contains = (element) => element === controls;
  const frame = new EventTarget();
  frame.contentDocument = game;
  frame.contentWindow = {};
  frame.getBoundingClientRect = () => ({ top: 10 });
  let now = 0;
  let id = 0;
  let visible;
  const timers = new Map();
  const hostWindow = {
    setTimeout(callback, delay) { timers.set(++id, { callback, at: now + delay }); return id; },
    clearTimeout(timer) { timers.delete(timer); },
  };
  const observer = observeControlVisibility({ controls, frame, hostWindow, menuShortcut, onVisible(value) { visible = value; } });
  const fire = (target, type, props = {}) => {
    const event = new Event(type);
    Object.assign(event, props);
    target.dispatchEvent(event);
  };
  return {
    host, game, canvas, controls, frame, observer, timers, fire,
    get visible() { return visible; },
    move(y, target = game, x = 500) { fire(target, "pointermove", { pointerType: "mouse", clientX: x, clientY: y, view: target === host ? hostWindow : frame.contentWindow }); },
    advance(ms) {
      const until = now + ms;
      for (;;) {
        const next = [...timers].filter(([, timer]) => timer.at <= until).sort((a, b) => a[1].at - b[1].at)[0];
        if (!next) break;
        now = next[1].at;
        timers.delete(next[0]);
        next[1].callback();
      }
      now = until;
    },
  };
}

test("controls start visible, reveal across both documents, and hide despite continued gameplay movement", () => {
  const client = player();
  assert.equal(client.visible, true);
  client.advance(3000);
  assert.equal(client.visible, false);
  client.move(70); // 70 + frame offset = top boundary.
  assert.equal(client.visible, true);
  client.advance(5000);
  assert.equal(client.visible, true);
  client.move(71);
  client.advance(500);
  client.move(400);
  client.advance(500);
  assert.equal(client.visible, false);
  client.move(20, client.host);
  assert.equal(client.visible, true);
  client.fire(client.host.documentElement, "pointerleave");
  client.advance(1000);
  assert.equal(client.visible, true);
  client.move(400);
  client.advance(1000);
  assert.equal(client.visible, false);
  client.observer.dispose();
});

test("Tab reveals hidden controls and focused controls cannot time out", () => {
  const client = player();
  client.advance(3000);
  client.fire(client.game, "keydown", { key: "Tab" });
  assert.equal(client.visible, true);
  client.host.activeElement = client.controls;
  client.fire(client.controls, "focusin");
  client.move(500);
  client.advance(5000);
  assert.equal(client.visible, true);
  client.fire(client.controls, "focusout");
  client.host.activeElement = null;
  client.advance(1000);
  assert.equal(client.visible, false);
  client.observer.dispose();
});

test("leaving any canvas edge reveals controls and keeps them visible until gameplay resumes", () => {
  const client = player();
  client.canvas.getBoundingClientRect = () => ({ left: 200, top: 100, right: 1000, bottom: 700 });
  for (const [x, y] of [[199, 400], [1000, 400], [500, 99], [500, 700]]) {
    client.move(400);
    client.advance(3000);
    assert.equal(client.visible, false);
    client.move(y, client.game, x);
    assert.equal(client.visible, true);
    client.advance(5000);
    assert.equal(client.visible, true, "stationary pointer outside the canvas keeps controls visible");
  }
  client.move(400);
  client.advance(1000);
  assert.equal(client.visible, false);
  client.move(400, client.host);
  assert.equal(client.visible, true, "leaving the iframe also reveals controls away from the top edge");
  client.observer.dispose();
});

test("canvas and document pointer exits reveal controls without a subsequent move", () => {
  const client = player();
  for (const target of [client.canvas, client.game.documentElement, client.host.documentElement]) {
    client.move(400);
    client.advance(3000);
    const event = new Event("pointerleave");
    Object.defineProperty(event, "target", { value: target });
    client.game.dispatchEvent(event);
    assert.equal(client.visible, true);
    client.advance(5000);
    assert.equal(client.visible, true);
  }
  client.observer.dispose();
});

test("touch and captured pointer exits do not reveal controls", () => {
  const client = player();
  client.advance(3000);
  client.fire(client.game, "pointermove", { pointerType: "touch", clientX: 0, clientY: 400, view: client.frame.contentWindow });
  client.fire(client.host.documentElement, "pointerleave", { pointerType: "touch" });
  assert.equal(client.visible, false);
  client.game.pointerLockElement = client.canvas;
  client.fire(client.game, "pointerlockchange");
  client.move(400, client.game, 0);
  client.fire(client.host.documentElement, "pointerleave");
  assert.equal(client.visible, false);
  client.observer.dispose();
});

test("cursor capture hides controls, ignores fixed coordinates, and Escape releases and reveals", () => {
  const client = player();
  client.game.pointerLockElement = {};
  let exits = 0;
  client.game.exitPointerLock = () => { exits++; client.game.pointerLockElement = null; };
  client.fire(client.game, "pointerlockchange");
  assert.equal(client.visible, false);
  client.move(20);
  assert.equal(client.visible, false);
  client.fire(client.game, "keydown", { key: "Escape" });
  assert.equal(exits, 1);
  assert.equal(client.visible, true);
  client.advance(3000);
  assert.equal(client.visible, false);
  client.game.pointerLockElement = null;
  client.fire(client.game, "pointerlockchange");
  assert.equal(client.visible, true);
  client.observer.dispose();
});

test("controls start hidden when the game captured the cursor before observation", () => {
  const client = player(undefined, { initiallyCaptured: true });
  assert.equal(client.visible, false);
  assert.equal(client.timers.size, 0);
  client.game.pointerLockElement = null;
  client.fire(client.game, "pointerlockchange");
  assert.equal(client.visible, true);
  client.observer.dispose();
});

test("cursor capture clears toolbar focus so it cannot keep buttons visible", () => {
  const client = player();
  client.controls.blur = () => {
    client.host.activeElement = null;
    client.fire(client.controls, "focusout");
  };
  client.host.activeElement = client.controls;
  client.fire(client.controls, "focusin");
  client.game.pointerLockElement = {};
  client.fire(client.game, "pointerlockchange");
  assert.equal(client.host.activeElement, null);
  assert.equal(client.visible, false);
  assert.equal(client.timers.size, 0);
  client.move(20);
  assert.equal(client.visible, false);
  client.observer.dispose();
});

test("frame navigation immediately honors an already captured cursor", () => {
  const client = player();
  const replacement = new EventTarget();
  replacement.getElementById = () => null;
  replacement.pointerLockElement = {};
  client.frame.contentDocument = replacement;
  client.fire(client.frame, "load");
  assert.equal(client.visible, false);
  assert.equal(client.timers.size, 0);
  client.observer.dispose();
});

test("opening the menu holds the controls until Escape or cursor capture", () => {
  const client = player();
  client.observer.holdForMenu();
  client.move(500);
  client.advance(5000);
  assert.equal(client.visible, true);
  client.fire(client.game, "keydown", { key: "Escape" });
  client.advance(3000);
  assert.equal(client.visible, false);
  client.observer.holdForMenu();
  client.game.pointerLockElement = {};
  client.fire(client.game, "pointerlockchange");
  assert.equal(client.visible, false);
  client.observer.dispose();
});

test("the game's configured menu shortcut also keeps controls visible", () => {
  const client = player({ key: "F1" });
  client.advance(3000);
  client.fire(client.game, "keydown", { key: "F1", ctrlKey: true });
  assert.equal(client.visible, false, "unrelated shortcuts do not pin the toolbar");
  client.fire(client.game, "keydown", { key: "F1" });
  client.move(500);
  client.advance(5000);
  assert.equal(client.visible, true);
  client.observer.dispose();
});

test("frame navigation replaces listeners and disposal cancels pending work", () => {
  const client = player();
  const replacement = new EventTarget();
  replacement.getElementById = () => null;
  client.frame.contentDocument = replacement;
  client.fire(client.frame, "load");
  client.advance(3000);
  client.move(20); // Old frame document no longer reveals controls.
  assert.equal(client.visible, false);
  client.move(20, replacement);
  assert.equal(client.visible, true);
  client.move(500, replacement);
  client.observer.dispose();
  assert.equal(client.timers.size, 0);
  client.advance(5000);
  assert.equal(client.visible, true);
});
