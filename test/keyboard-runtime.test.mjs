import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import vm from "node:vm";
import test from "node:test";

const source = fs.readFileSync(new URL("../scummvm-shell/scummvm.js", import.meta.url), "utf8");
const adapter = new URL("../scripts/patch_scummvm_keyboard.py", import.meta.url).pathname;

function runtime() {
  const calls = [];
  const heap = new ArrayBuffer(1024);
  const context = vm.createContext({
    navigator: { userActivation: { isActive: false } },
    _malloc: () => 128,
    HEAP8: new Int8Array(heap), HEAP32: new Int32Array(heap), HEAPF64: new Float64Array(heap),
    stringToUTF8() {}, findEventTarget: (target) => target,
    dynCall_iiii(callback, type, data, userData) {
      calls.push({ callback, type, userData, repeat: new Int8Array(heap)[data + 16] });
      return 0;
    },
  });
  // Exercise the actual generated listener registration/removal implementation.
  const events = source.slice(source.indexOf("var JSEvents={"), source.indexOf(";var specialHTMLTargets="));
  const keyboard = source.slice(source.indexOf("var registerKeyEventCallback="), source.indexOf(";var _emscripten_set_keydown_callback"));
  vm.runInContext(`${events};${keyboard}`, context);
  return { calls, register: context.registerKeyEventCallback, handlers: context.JSEvents.eventHandlers };
}

test("display recreation replaces stale keyboard callbacks and preserves native repeat", () => {
  const r = runtime();
  const target = new EventTarget();
  let domEvents = 0;
  target.addEventListener("keydown", () => { domEvents++; });
  for (let window = 1; window <= 6; window++) {
    for (const [id, type] of [[2, "keydown"], [1, "keypress"], [3, "keyup"]]) {
      r.register(target, window, false, 71, id, type);
    }
  }
  assert.equal(r.handlers.length, 3);
  for (const repeat of [false, true, true]) {
    const event = new Event("keydown", { cancelable: true });
    event.repeat = repeat;
    target.dispatchEvent(event);
  }
  target.dispatchEvent(new Event("keypress"));
  target.dispatchEvent(new Event("keyup"));
  assert.equal(domEvents, 3);
  assert.deepEqual(r.calls, [
    { callback: 71, type: 2, userData: 6, repeat: 0 },
    { callback: 71, type: 2, userData: 6, repeat: 1 },
    { callback: 71, type: 2, userData: 6, repeat: 1 },
    { callback: 71, type: 1, userData: 6, repeat: 0 },
    { callback: 71, type: 3, userData: 6, repeat: 0 },
  ]);
  r.register(target, 0, false, 0, 2, "keydown");
  target.dispatchEvent(new Event("keydown"));
  assert.equal(r.calls.length, 5, "explicit unregister must still remove the native callback");
  assert.equal(domEvents, 4, "ordinary browser listeners must remain installed");
});

test("independent native callbacks, targets and capture phases remain registered", () => {
  const r = runtime();
  const target = new EventTarget();
  const other = new EventTarget();
  r.register(target, 1, false, 71, 2, "keydown");
  r.register(target, 2, false, 72, 2, "keydown");
  r.register(target, 3, true, 71, 2, "keydown");
  r.register(other, 4, false, 71, 2, "keydown");
  r.register(target, 5, false, 71, 2, "keydown");
  assert.equal(r.handlers.length, 4);
  target.dispatchEvent(new Event("keydown"));
  other.dispatchEvent(new Event("keydown"));
  assert.deepEqual(r.calls.map(({ userData }) => userData).sort(), [2, 3, 4, 5]);
});

test("keyboard adapter is idempotent and rejects unsupported generated glue", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "scummweb-keyboard-"));
  const file = path.join(dir, "scummvm.js");
  try {
    fs.writeFileSync(file, source);
    assert.equal(spawnSync("python3", [adapter, file]).status, 0);
    assert.equal(fs.readFileSync(file, "utf8"), source);
    fs.writeFileSync(file, "unsupported glue");
    assert.notEqual(spawnSync("python3", [adapter, file]).status, 0);
    assert.equal(fs.readFileSync(file, "utf8"), "unsupported glue");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
