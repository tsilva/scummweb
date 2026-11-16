import assert from "node:assert/strict";
import test from "node:test";
import { afterHeroPaint, handoverLibraryDrops } from "../app/home-shell/library-hydration.mjs";

function fixture(hero = true) {
  const target = new EventTarget();
  target.document = new EventTarget();
  let decoded;
  target.document.querySelector = () => hero && { decode: () => new Promise(resolve => { decoded = resolve; }) };
  const frames = new Map(), timers = new Map();
  let id = 0;
  target.requestAnimationFrame = fn => { frames.set(++id, fn); return id; };
  target.cancelAnimationFrame = id => frames.delete(id);
  target.setTimeout = (fn, ms) => { assert.equal(ms, 1000); timers.set(++id, fn); return id; };
  target.clearTimeout = id => timers.delete(id);
  const frame = () => { const callbacks = [...frames.values()]; frames.clear(); callbacks.forEach(fn => fn()); };
  return { target, frames, timers, frame, decode: () => decoded() };
}
const tick = () => new Promise(resolve => setImmediate(resolve));

test("library waits for decoded hero and two paint opportunities", async () => {
  const f = fixture(); let ready = false;
  const waiting = afterHeroPaint(f.target).then(() => { ready = true; });
  f.decode(); await tick(); assert.equal(ready, false);
  f.frame(); await tick(); assert.equal(ready, false);
  f.frame(); await waiting; assert.equal(ready, true);
  assert.equal(f.frames.size, 0); assert.equal(f.timers.size, 0);
  handoverLibraryDrops(() => {}, f.target);
});

for (const type of ["pointerdown", "keydown", "click", "dragenter"]) {
  test(`${type} releases a stalled hero immediately`, async () => {
    const f = fixture(); const waiting = afterHeroPaint(f.target);
    f.target.document.dispatchEvent(new Event(type)); await waiting;
    assert.equal(f.timers.size, 0); f.decode(); await tick(); assert.equal(f.frames.size, 0);
    handoverLibraryDrops(() => {}, f.target);
  });
}
test("deadline releases controls even when the image never completes", async () => {
  const f = fixture(); const waiting = afterHeroPaint(f.target);
  [...f.timers.values()][0](); await waiting;
  assert.equal(f.timers.size, 0); handoverLibraryDrops(() => {}, f.target);
});
test("a page without a hero does not defer", async () => { await afterHeroPaint(fixture(false).target); });

test("early drops capture handles during the event and hand them over exactly once", async () => {
  const f = fixture(); const waiting = afterHeroPaint(f.target);
  let active = true, calls = 0;
  const file = { name: "game.zip" };
  const transfer = { types: ["Files"], files: [file], items: [{ kind: "file", getAsFile() { assert.equal(active, true); calls++; return file; } }] };
  const event = Object.assign(new Event("drop", { cancelable: true }), { dataTransfer: transfer });
  f.target.dispatchEvent(event); active = false; await waiting;
  assert.equal(event.defaultPrevented, true); assert.equal(calls, 1);
  let captured;
  handoverLibraryDrops(roots => { captured = roots; }, f.target);
  handoverLibraryDrops(() => assert.fail("duplicate drop"), f.target);
  assert.equal(await (await captured[0]).getFile(), file);
  const later = Object.assign(new Event("drop", { cancelable: true }), { dataTransfer: transfer });
  f.target.dispatchEvent(later); assert.equal(later.defaultPrevented, false); assert.equal(calls, 1);
});
