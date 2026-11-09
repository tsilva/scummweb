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

test("Grim's stick ignores thumb drift and holds both keys on a deliberate diagonal", () => {
  const events = [];
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
      if (name === "./keyboard") return {
        holdGameKey(_frame, { key }) {
          events.push(`press ${key}`);
          return () => events.push(`release ${key}`);
        },
      };
      return requireNative(name);
    },
  });

  const { children: [movementStick, actions] } =
    module.exports.GrimTouchGamepad({ frameRef: { current: {} } }).props;
  const [toggle, choices] = actions.props.children;
  const buttons = [toggle, ...choices.props.children];
  assert.deepEqual(Array.from(buttons, ({ props }) => props["aria-label"]), [
    "Actions", "Use / Talk", "Examine", "Pick up / Put away", "Inventory",
  ]);
  for (const { props } of buttons) {
    assert.equal(props.children.props["aria-hidden"], "true");
  }
  cursor = 0;
  hooks = [];
  const stick = movementStick.type(movementStick.props).props.children[0].props;
  const pointer = (pointerId, clientX, clientY) => ({
    pointerId, clientX, clientY, button: 0, preventDefault() {},
    currentTarget: {
      setPointerCapture() {},
      getBoundingClientRect: () => ({ width: 100, height: 100 }),
    },
  });

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
