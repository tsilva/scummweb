import assert from "node:assert/strict";
import test from "node:test";
import { installCanvasFit } from "../web-shell/canvas-fit.mjs";

test("canvas fitting follows engine resolution and preserves the ratio through fill mode", () => {
  let update;
  let filling = false;
  let ratio;
  let writes = 0;
  let disconnected = false;
  const canvas = {
    width: 640, height: 480,
    classList: { contains: () => filling },
    style: { setProperty(key, value) { assert.equal(key, "--scummweb-canvas-ratio"); ratio = Number(value); writes++; } },
  };
  class Observer {
    constructor(callback) { update = callback; }
    observe(element, options) { assert.equal(element, canvas); assert.deepEqual(options.attributeFilter, ["width", "height"]); }
    disconnect() { disconnected = true; }
  }
  const cleanup = installCanvasFit(canvas, Observer);
  assert.equal(ratio, 4 / 3);
  canvas.width = 390; canvas.height = 293; update();
  assert.equal(writes, 1, "rounding a fitted canvas must not cause a resize loop");
  filling = true; canvas.width = 844; canvas.height = 390; update();
  assert.equal(ratio, 4 / 3);
  filling = false; canvas.width = 1280; canvas.height = 720; update();
  assert.equal(ratio, 16 / 9);
  canvas.height = 0; update();
  assert.equal(ratio, 16 / 9);
  cleanup();
  assert.equal(disconnected, true);
});
