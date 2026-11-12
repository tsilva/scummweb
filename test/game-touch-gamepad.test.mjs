import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import test from "node:test";
import swc from "next/dist/build/swc/index.js";

const componentUrl = new URL("../app/game-player/GameTouchGamepad.js", import.meta.url);
const requireNative = createRequire(componentUrl);
await swc.loadBindings();
const { code } = await swc.transform(await readFile(componentUrl, "utf8"), {
  filename: componentUrl.pathname, swcrc: false, configFile: false,
  module: { type: "commonjs" },
  jsc: { parser: { syntax: "ecmascript", jsx: true }, transform: { react: { runtime: "automatic" } } },
});

const pointer = (pointerId, clientX, clientY) => ({
  pointerId, clientX, clientY, button: 0, preventDefault() {},
  currentTarget: {
    setPointerCapture() {},
    getBoundingClientRect: () => ({ width: 100, height: 100 }),
  },
});

function loadGamepad(keyboard, mouse = {}) {
  let cursor = 0;
  let hooks = [];
  const module = { exports: {} };
  runInNewContext(code, {
    module, exports: module.exports,
    window: { location: { origin: "https://example.test" } },
    require(name) {
      if (name === "react") return {
        useEffect() {},
        useId: () => "actions",
        useRef: (current) => hooks[cursor++] ??= { current },
        useState(initial) {
          const index = cursor++;
          hooks[index] ??= initial;
          return [hooks[index], (value) => { hooks[index] = value; }];
        },
      };
      if (name === "./keyboard") return keyboard;
      if (name === "./game-mouse.mjs") return mouse;
      return requireNative(name);
    },
  });

  return {
    ...module.exports,
    rerender(render) {
      cursor = 0;
      return render();
    },
    resetHooks() {
      cursor = 0;
      hooks = [];
    },
  };
}

test("Grim's stick ignores thumb drift and holds both keys on a deliberate diagonal", () => {
  const events = [];
  const gamepad = loadGamepad({
    holdGameKey(_frame, { key }) {
      events.push(`press ${key}`);
      return () => events.push(`release ${key}`);
    },
  });
  const { children: [movementStick, actions] } =
    gamepad.GameTouchGamepad({ frameRef: { current: {} } }).props;
  const [toggle, choices] = actions.props.children;
  const buttons = [toggle, ...choices.props.children];
  assert.deepEqual(Array.from(buttons, ({ props }) => props["aria-label"]), [
    "Actions", "Use / Talk", "Examine", "Pick up / Put away", "Inventory",
  ]);
  for (const { props } of buttons) {
    assert.equal(props.children.props["aria-hidden"], "true");
  }
  assert.equal(toggle.props.children.type.displayName, "Zap");
  gamepad.resetHooks();
  const stick = movementStick.type(movementStick.props).props;
  assert.equal(stick["aria-label"], "Walk and turn");
  assert.ok(stick.children.every((child) => typeof child === "object"));

  stick.onPointerDown(pointer(1, 70, 60)); // An off-center touch starts neutral.
  assert.deepEqual(events, []);
  stick.onPointerMove(pointer(1, 86, 30)); // A shallow diagonal walks straight.
  assert.deepEqual(events, ["press ArrowUp"]);
  stick.onPointerMove(pointer(1, 95, 30));
  assert.deepEqual(events, ["press ArrowUp", "press ArrowRight"]);
  stick.onPointerMove(pointer(1, 86, 30)); // Drift toward vertical keeps the held turn stable.
  stick.onPointerMove(pointer(2, 70, 60)); // A second pointer cannot interrupt the grip.
  assert.deepEqual(events, ["press ArrowUp", "press ArrowRight"]);
  stick.onPointerMove(pointer(1, 80, 30));
  assert.deepEqual(events, ["press ArrowUp", "press ArrowRight", "release ArrowRight"]);
  stick.onPointerMove(pointer(1, 95, 30));
  stick.onPointerMove(pointer(1, 45, 30));
  stick.onPointerMove(pointer(1, 70, 60));

  assert.deepEqual(events, [
    "press ArrowUp", "press ArrowRight", "release ArrowRight", "press ArrowRight",
    "release ArrowRight", "press ArrowLeft", "release ArrowUp", "release ArrowLeft",
  ]);

  stick.onPointerMove(pointer(1, 95, 85));
  stick.onPointerCancel(pointer(1, 95, 85));
  stick.onLostPointerCapture(pointer(1, 95, 85));
  assert.deepEqual(events.slice(8), [
    "press ArrowDown", "press ArrowRight", "release ArrowDown", "release ArrowRight",
  ]);
});

test("Escape from Monkey Island shares Grim's stick and sends its native action keys", () => {
  const frame = {};
  const events = [];
  const gamepad = loadGamepad({
    holdGameKey(target, { key }) {
      assert.equal(target, frame);
      events.push(`press ${key}`);
      return () => events.push(`release ${key}`);
    },
    dispatchSyntheticKeypress(target, key) {
      assert.equal(target, frame);
      events.push(key);
    },
  });
  const [movement, actions] = gamepad.GameTouchGamepad({ frameRef: { current: frame }, mode: "monkey4" }).props.children;
  gamepad.resetHooks();
  const stick = movement.type(movement.props).props;
  stick.onPointerDown(pointer(1, 50, 50));
  stick.onPointerMove(pointer(1, 75, 25));
  stick.onPointerUp(pointer(1, 75, 25));
  assert.deepEqual(events.splice(0), ["press ArrowUp", "press ArrowRight", "release ArrowUp", "release ArrowRight"]);
  const [, choices] = actions.props.children;
  assert.deepEqual(Array.from(choices.props.children, ({ props }) => props["aria-label"]), [
    "Use / Talk", "Examine", "Pick up / Put away", "Inventory",
  ]);
  for (const button of choices.props.children) button.props.onClick();
  assert.equal(events[0], "u");
  assert.equal(events[1], "e");
  assert.equal(events[2].key, "+");
  assert.equal(events[2].code, "NumpadAdd");
  assert.equal(events[2].keyCode, 107);
  assert.equal(events[3].key, "Insert");
  assert.equal(events[3].keyCode, 45);
});

test("Hugo's stick changes direction without toggling on drift and stops after a collision", () => {
  const presses = [];
  let walking;
  const frame = { contentDocument: {} };
  const gamepad = loadGamepad({
    dispatchSyntheticKeypress(target, { code, key }, options) {
      assert.equal(target, frame);
      const direction = code || key;
      presses.push([direction, options?.focus]);
      walking = walking === direction ? undefined : direction;
      return true;
    },
  });
  const stick = gamepad.GameMovementStick({ frameRef: { current: frame }, hugo: true }).props;
  stick.onPointerDown(pointer(1, 50, 50));
  stick.onPointerMove(pointer(1, 50, 25));
  stick.onPointerMove(pointer(1, 52, 25));
  stick.onPointerMove(pointer(1, 75, 25));
  assert.equal(walking, "Numpad9");
  assert.deepEqual(presses, [["ArrowUp", undefined], ["Numpad9", undefined]]);

  walking = undefined; // A native boundary collision clears velocity while the thumb is down.
  stick.onPointerUp(pointer(1, 75, 25));
  assert.equal(walking, undefined);
  assert.deepEqual(presses.slice(2), [["ArrowUp", false], ["Numpad9", false], ["Numpad9", false]]);

  stick.onPointerDown(pointer(2, 50, 50));
  stick.onPointerMove(pointer(2, 25, 50));
  assert.equal(walking, "ArrowLeft");
  stick.onPointerMove(pointer(2, 50, 50));
  assert.equal(walking, undefined);
  const afterCenter = presses.length;
  stick.onPointerCancel(pointer(2, 50, 50));
  assert.equal(presses.length, afterCenter);
});

test("Castle Master's stick holds walking or turning and releases on recenter, cancel, and lift", () => {
  const events = [];
  const frame = {};
  const gamepad = loadGamepad({
    holdGameKey(target, input) {
      assert.equal(target, frame);
      const key = typeof input === "string" ? input : input.key;
      events.push(`press ${key}`);
      return () => events.push(`release ${key}`);
    },
  });
  const stick = gamepad.GameMovementStick({ frameRef: { current: frame }, castle: true }).props;
  stick.onPointerDown(pointer(1, 50, 50));
  stick.onPointerMove(pointer(1, 50, 25));
  stick.onPointerMove(pointer(1, 52, 25));
  assert.deepEqual(events, ["press ArrowUp"]);
  stick.onPointerMove(pointer(1, 75, 30)); // Dominant horizontal axis turns, rather than strafing.
  stick.onPointerMove(pointer(1, 55, 25)); // Returning vertical resumes native walking repeat.
  stick.onPointerMove(pointer(1, 50, 50));
  assert.deepEqual(events, ["press ArrowUp", "release ArrowUp", "press x", "release x",
    "press ArrowUp", "release ArrowUp"]);
  stick.onPointerMove(pointer(1, 25, 50));
  stick.onPointerUp(pointer(1, 25, 50));
  stick.onLostPointerCapture(pointer(1, 25, 50));
  stick.onPointerDown(pointer(2, 50, 50));
  stick.onPointerMove(pointer(2, 50, 75));
  stick.onPointerCancel(pointer(2, 50, 75));
  assert.deepEqual(events.slice(6), ["press z", "release z", "press ArrowDown", "release ArrowDown"]);
});

test("Castle Master's touch drag sends movement without transferring focus to the iframe", () => {
  const events = [];
  let stick;
  const gamepad = loadGamepad({
    holdGameKey(_frame, input, options) {
      events.push(`press ${typeof input === "string" ? input : input.key}`);
      // Model a mobile focus transfer cancelling the active pointer gesture.
      if (options?.focus !== false) stick.onPointerCancel(pointer(1, 75, 50));
      return () => events.push("release");
    },
  });
  stick = gamepad.GameMovementStick({ frameRef: { current: {} }, castle: true }).props;
  stick.onPointerDown(pointer(1, 50, 50));
  stick.onPointerMove(pointer(1, 75, 50));
  stick.onPointerMove(pointer(1, 25, 50));
  assert.deepEqual(events, ["press x", "release", "press z"]);
  stick.onPointerUp(pointer(1, 25, 50));
  assert.deepEqual(events, ["press x", "release", "press z", "release"]);
});

test("Castle Master's finger moves the knob despite pointer cancellation and stops only for that finger", () => {
  const events = [];
  const frame = {};
  const gamepad = loadGamepad({
    holdGameKey(target, input, options) {
      assert.equal(target, frame);
      assert.equal(options.focus, false);
      const key = typeof input === "string" ? input : input.key;
      events.push(`press ${key}`);
      return () => events.push(`release ${key}`);
    },
  });
  const frameRef = { current: frame };
  const render = () => gamepad.rerender(() => gamepad.GameMovementStick({ frameRef, castle: true }).props);
  const touch = (identifier, clientX, clientY) => ({ identifier, clientX, clientY });
  const touchEvent = (...changedTouches) => ({
    changedTouches, currentTarget: pointer(7, 50, 50).currentTarget,
  });
  let stick = render();
  const touchPointer = { ...pointer(7, 50, 50), pointerType: "touch" };
  touchPointer.currentTarget.setPointerCapture = () => assert.fail("touch must not require pointer capture");
  stick.onPointerDown(touchPointer);
  stick.onTouchStart(touchEvent(touch(7, 50, 50)));
  stick.onPointerCancel(touchPointer);
  stick.onLostPointerCapture(touchPointer);
  stick.onTouchMove(touchEvent(touch(7, 75, 50)));
  stick = render();
  assert.equal(stick.children.at(-1).props.style.transform, "translate(25px, 0px)");
  assert.deepEqual(events, ["press x"]);

  stick.onPointerUp(touchPointer);
  stick.onTouchStart(touchEvent(touch(8, 80, 50)));
  stick.onTouchMove(touchEvent(touch(8, 25, 50)));
  stick.onTouchEnd(touchEvent(touch(8, 25, 50)));
  assert.deepEqual(events, ["press x"], "another finger must not replace or release the grip");

  stick.onTouchMove(touchEvent(touch(7, 50, 25)));
  assert.deepEqual(events, ["press x", "release x", "press ArrowUp"]);
  stick.onLostPointerCapture(touchPointer);
  stick.onTouchEnd(touchEvent(touch(7, 50, 25)));
  stick = render();
  assert.equal(stick.children.at(-1).props.style.transform, "translate(0px, 0px)");
  assert.deepEqual(events, ["press x", "release x", "press ArrowUp", "release ArrowUp"]);

  stick.onTouchStart(touchEvent(touch(9, 50, 50)));
  stick.onTouchMove(touchEvent(touch(9, 25, 50)));
  stick.onTouchMove(touchEvent(touch(9, 50, 50)));
  stick.onTouchMove(touchEvent(touch(9, 50, 75)));
  stick.onTouchCancel(touchEvent(touch(9, 50, 75)));
  stick.onTouchEnd(touchEvent(touch(9, 50, 75)));
  assert.deepEqual(events.slice(4), ["press z", "release z", "press ArrowDown", "release ArrowDown"]);
});

test("a gesture cancelled during movement dispatch cannot leave a key held", () => {
  const events = [];
  let stick;
  const gamepad = loadGamepad({
    holdGameKey() {
      events.push("press");
      stick.onLostPointerCapture(pointer(1, 50, 25));
      return () => events.push("release");
    },
  });
  stick = gamepad.GameMovementStick({ frameRef: { current: {} }, castle: true }).props;
  stick.onPointerDown(pointer(1, 50, 50));
  stick.onPointerMove(pointer(1, 50, 25));
  assert.deepEqual(events, ["press", "release"]);
  stick.onPointerUp(pointer(1, 50, 25));
  assert.deepEqual(events, ["press", "release"]);
});

test("Castle Master actions dispatch the native keys and activation uses right click", () => {
  const events = [];
  const frame = {};
  const gamepad = loadGamepad({
    dispatchSyntheticKeypress(target, key) {
      assert.equal(target, frame);
      events.push(key);
    },
  }, {
    clickGameMouse(target, origin, button) {
      assert.equal(target, frame);
      assert.equal(origin, "https://example.test");
      events.push(button);
    },
  });
  const [stick, actions] = gamepad.GameTouchGamepad({ frameRef: { current: frame }, mode: "castle" }).props.children;
  assert.equal(stick.props.castle, true);
  const [, choices] = actions.props.children;
  const buttons = choices.props.children;
  assert.deepEqual(Array.from(buttons, ({ props }) => props["aria-label"]), [
    "Use / Activate", "Throw rock", "Look up", "Look down", "Face forward", "Walk", "Run", "Crawl", "Game information",
  ]);
  for (const button of buttons) button.props.onClick();
  assert.deepEqual(events, ["right", "0", "p", "l", "f", "w", "r", "c", "i"]);
});
