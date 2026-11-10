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

function loadGamepad(keyboard) {
  let cursor = 0;
  let hooks = [];
  const module = { exports: {} };
  runInNewContext(code, {
    module, exports: module.exports,
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
      return requireNative(name);
    },
  });

  return {
    ...module.exports,
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
    gamepad.GrimTouchGamepad({ frameRef: { current: {} } }).props;
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
