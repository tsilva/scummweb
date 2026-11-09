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

test("Grim's two sticks hold separate axes and release keys on reversal and cancellation", () => {
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

  const { children: [walkStick, rightControls] } =
    module.exports.GrimTouchGamepad({ frameRef: { current: {} } }).props;
  const [, turnStick] = rightControls.props.children;

  function mountStick(element) {
    cursor = 0;
    hooks = [];
    return element.type(element.props).props.children[0].props;
  }

  const walk = mountStick(walkStick);
  const turn = mountStick(turnStick);
  const pointer = (pointerId, clientX, clientY) => ({
    pointerId, clientX, clientY, button: 0, preventDefault() {},
    currentTarget: {
      setPointerCapture() {},
      getBoundingClientRect: () => ({ left: 0, top: 0, width: 100, height: 100 }),
    },
  });

  walk.onPointerDown(pointer(1, 99, 50)); // Horizontal drag is outside the walk axis.
  assert.deepEqual(events, []);
  walk.onPointerMove(pointer(1, 99, 20));
  turn.onPointerDown(pointer(2, 80, 0));
  walk.onPointerMove(pointer(1, 40, 80));
  turn.onPointerCancel(pointer(2, 80, 0));
  walk.onLostPointerCapture(pointer(1, 40, 80));

  assert.deepEqual(events, [
    "press ArrowUp", "press ArrowRight", "release ArrowUp", "press ArrowDown",
    "release ArrowRight", "release ArrowDown",
  ]);
});
