import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import vm from "node:vm";
import test from "node:test";

const adapter = new URL("../scripts/patch_scummvm_lifecycle.py", import.meta.url).pathname;
const source = fs.readFileSync(new URL("../scummvm-shell/scummvm.js", import.meta.url), "utf8");
const original = 'window.addEventListener("beforeunload",function(e){Module["_raise"](2)});';
const guarded = 'window.addEventListener("beforeunload",function(e){if(runtimeInitialized&&!ABORT&&typeof Module["_raise"]==="function"){Module["_raise"](2)}});';

function unload(glue, initialized, aborted, raise) {
  let listener;
  vm.runInNewContext(glue, {
    runtimeInitialized: initialized, ABORT: aborted, Module: { _raise: raise },
    window: { addEventListener(type, fn) { assert.equal(type, "beforeunload"); listener = fn; } },
  });
  listener({});
}

test("unloading skips missing exports and the native constructor interval", () => {
  assert.equal(source.split(guarded).length - 1, 1, "managed runtime must contain the guarded hook");
  assert.throws(() => unload(original, false, false, undefined), /not a function/);
  const unsafeRaise = () => { throw new WebAssembly.RuntimeError("function signature mismatch"); };
  assert.throws(() => unload(original, false, false, unsafeRaise), /function signature mismatch/);
  unload(guarded, false, false, undefined);
  unload(guarded, false, false, unsafeRaise);
  unload(guarded, true, true, unsafeRaise);
});

test("initialized runtime preserves native SIGINT and exposes real signal failures", () => {
  const signals = [];
  unload(guarded, true, false, (signal) => signals.push(signal));
  assert.deepEqual(signals, [2]);
  assert.throws(() => unload(guarded, true, false, () => { throw Error("native failure"); }), /native failure/);
});

test("lifecycle adapter applies once and rejects unsupported glue without writing", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "scummweb-lifecycle-"));
  const file = path.join(dir, "scummvm.js");
  try {
    fs.writeFileSync(file, original);
    assert.equal(spawnSync("python3", [adapter, file]).status, 0);
    assert.equal(fs.readFileSync(file, "utf8"), guarded);
    assert.equal(spawnSync("python3", [adapter, file]).status, 0);
    assert.equal(fs.readFileSync(file, "utf8"), guarded);
    fs.writeFileSync(file, "unsupported glue");
    assert.notEqual(spawnSync("python3", [adapter, file]).status, 0);
    assert.equal(fs.readFileSync(file, "utf8"), "unsupported glue");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
