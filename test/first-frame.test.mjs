import assert from "node:assert/strict";
import test from "node:test";
import { observeCanvasPresentation } from "../web-shell/first-frame.mjs";

test("a presented dark game frame is accepted immediately, while prelaunch paints are ignored", () => {
  let launched = false;
  let accepted = 0;
  const frame = { data: new Uint8Array(16) };
  const context = { putImageData(image) { assert.equal(this, context); assert.equal(image, frame); return 42; } };
  const canvas = { getContext(type) { assert.equal(this, canvas); return type === "2d" ? context : null; } };
  const originalGet = canvas.getContext;
  const originalPut = context.putImageData;
  observeCanvasPresentation(canvas, () => { if (!launched) return false; accepted++; return true; });
  assert.equal(canvas.getContext("webgl"), null);
  canvas.getContext("2d");
  assert.equal(context.putImageData(frame), 42);
  assert.equal(accepted, 0);
  launched = true;
  assert.equal(context.putImageData(frame), 42);
  assert.equal(accepted, 1);
  assert.equal(canvas.getContext, originalGet);
  assert.equal(context.putImageData, originalPut);
  context.putImageData(frame);
  assert.equal(accepted, 1);
});

test("a failed canvas write never reports readiness and cleanup preserves later wrappers", () => {
  let ready = false;
  const context = { putImageData() { throw new Error("Invalid image"); } };
  const canvas = { getContext: () => context };
  const stop = observeCanvasPresentation(canvas, () => { ready = true; return true; });
  canvas.getContext("2d");
  assert.throws(() => context.putImageData(), /Invalid image/);
  assert.equal(ready, false);
  const replacement = () => {};
  context.putImageData = replacement;
  stop();
  assert.equal(context.putImageData, replacement);
});

for (const type of ["webgl", "webgl2", "experimental-webgl"]) {
  test(`${type} context discovery does not mistake splash draws for game readiness`, () => {
    const draw = () => 7;
    const context = { drawElements: draw };
    const canvas = { getContext: () => context };
    const observed = [];
    let accepted = 0;
    observeCanvasPresentation(canvas, () => { accepted++; return true; }, value => observed.push(value));
    assert.equal(canvas.getContext(type), context);
    assert.equal(context.drawElements(), 7);
    assert.equal(context.drawElements, draw);
    assert.equal(accepted, 0);
    assert.deepEqual(observed, [type]);
  });
}

test("a runtime-owned getContext wrapper does not reinstall observers after cleanup", () => {
  const original = () => {};
  const context = { putImageData: original };
  const canvas = { getContext: () => context };
  const stop = observeCanvasPresentation(canvas, () => true);
  const observed = canvas.getContext;
  const runtimeWrapper = (...args) => observed(...args);
  canvas.getContext = runtimeWrapper;
  canvas.getContext("2d");
  stop();
  canvas.getContext("2d");
  assert.equal(context.putImageData, original);
  assert.equal(canvas.getContext, runtimeWrapper);
});
