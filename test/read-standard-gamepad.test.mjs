import assert from "node:assert/strict";
import test from "node:test";
import { readStandardGamepad } from "../app/home-shell/read-standard-gamepad.mjs";

test("policy-denied gamepad access behaves like no connected controller", () => {
  const navigator = {
    getGamepads() { throw new DOMException("Blocked by permissions policy", "SecurityError"); },
  };
  assert.throws(() => navigator.getGamepads(), { name: "SecurityError" });
  assert.equal(readStandardGamepad(navigator), null);
});

test("missing API and disconnected controllers are supported", () => {
  assert.equal(readStandardGamepad({}), null);
  assert.equal(readStandardGamepad({ getGamepads: () => [null] }), null);
});

test("selects a standard controller while preserving the native receiver", () => {
  const standard = { mapping: "standard", buttons: [] };
  const navigator = {
    getGamepads() {
      assert.equal(this, navigator);
      return [null, { mapping: "" }, standard];
    },
  };
  assert.equal(readStandardGamepad(navigator), standard);
});

test("unexpected API failures remain visible", () => {
  const failure = new Error("Unexpected gamepad failure");
  assert.throws(() => readStandardGamepad({ getGamepads() { throw failure; } }), failure);
});
