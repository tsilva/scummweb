import assert from "node:assert/strict";
import test from "node:test";
import { createLibraryHold, removableLibraryVersions, restoreIncludedCatalog } from "../app/home-shell/library-removal.mjs";

test("restoring bundled games clears only the retired hiding preference, including malformed data", () => {
  for (const hidden of ['["catalog:sky", "catalog:queen"]', '{broken']) {
    const values = new Map([["scummweb.hidden-catalog-versions.v1", hidden],
      ["scummweb.save-namespace.v1:source:original", "original namespace"], ["/saves/game.001", "save bytes"]]);
    const storage = { removeItem: (key) => values.delete(key) };
    restoreIncludedCatalog(storage);
    restoreIncludedCatalog(storage);
    assert.equal(values.has("scummweb.hidden-catalog-versions.v1"), false);
    assert.equal(values.get("/saves/game.001"), "save bytes");
    assert.equal(values.get("scummweb.save-namespace.v1:source:original"), "original namespace");
  }
});

test("only imported versions can be removed from bundled, imported and mixed cards", () => {
  const bundled = { key: "catalog:sky", game: { target: "sky" } };
  const imported = { key: "source:custom", source: { id: "custom" } };
  assert.deepEqual(removableLibraryVersions({ versions: [bundled] }), []);
  assert.deepEqual(removableLibraryVersions({ versions: [imported] }), [imported]);
  assert.deepEqual(removableLibraryVersions({ versions: [bundled, imported] }), [imported]);
});

test("hold requires 600 ms on the primary pointer and cancels for release, movement or scrolling", () => {
  let callback, held = 0;
  const gesture = createLibraryHold(() => held++, {
    setTimer(fn, delay) { assert.equal(delay, 600); callback = fn; return 1; },
    clearTimer() { callback = undefined; },
  });
  const pointer = { button: 0, isPrimary: true, pointerId: 1, clientX: 30, clientY: 40 };
  gesture.start(pointer);
  gesture.move({ ...pointer, clientX: 35 });
  callback();
  assert.equal(held, 1);
  assert.equal(callback, undefined);
  for (const cancel of [() => gesture.cancel(), () => gesture.move({ ...pointer, clientY: 60 }),
    () => gesture.move({ ...pointer, pointerId: 2 })]) {
    gesture.start(pointer);
    cancel();
    assert.equal(callback, undefined);
  }
  gesture.start({ ...pointer, button: 2 });
  assert.equal(callback, undefined);
  gesture.start({ ...pointer, isPrimary: false });
  assert.equal(callback, undefined);
  assert.equal(held, 1);
});
