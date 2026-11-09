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

test("Grim's stick holds both keys on a diagonal and releases each axis independently", () => {
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
  assert.equal(actions.props.children[0].props.children, "Actions");
  cursor = 0;
  hooks = [];
  const stick = movementStick.type(movementStick.props).props.children[0].props;
  const pointer = (pointerId, clientX, clientY) => ({
    pointerId, clientX, clientY, button: 0, preventDefault() {},
    currentTarget: {
      setPointerCapture() {},
      getBoundingClientRect: () => ({ left: 0, top: 0, width: 100, height: 100 }),
    },
  });

  stick.onPointerDown(pointer(1, 54, 46));
  assert.deepEqual(events, []);
  stick.onPointerMove(pointer(1, 60, 0)); // A shallow diagonal still walks straight.
  assert.deepEqual(events, ["press ArrowUp"]);
  stick.onPointerMove(pointer(1, 80, 20));
  assert.deepEqual(events, ["press ArrowUp", "press ArrowRight"]);
  stick.onPointerMove(pointer(2, 50, 50)); // A second pointer cannot interrupt the grip.
  stick.onPointerMove(pointer(1, 20, 20));
  stick.onPointerMove(pointer(1, 50, 50));

  assert.deepEqual(events, [
    "press ArrowUp", "press ArrowRight", "release ArrowRight", "press ArrowLeft",
    "release ArrowUp", "release ArrowLeft",
  ]);

  stick.onPointerMove(pointer(1, 80, 80));
  stick.onPointerCancel(pointer(1, 80, 80));
  stick.onLostPointerCapture(pointer(1, 80, 80));
  assert.deepEqual(events.slice(6), [
    "press ArrowDown", "press ArrowRight", "release ArrowDown", "release ArrowRight",
  ]);
});
