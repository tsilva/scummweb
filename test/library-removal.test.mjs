import assert from "node:assert/strict";
import test from "node:test";
import { createLibraryHold, readHiddenCatalogVersions, visibleLibraryGroups, writeHiddenCatalogVersions } from "../app/home-shell/library-removal.mjs";

test("catalog removal persists independently of saves and promotes a remaining edition", () => {
  const values = new Map([["scummweb.save-namespace.v1:source:original", "original namespace"], ["/saves/game.001", "save bytes"]]);
  const storage = { getItem: (key) => values.get(key), setItem: (key, value) => values.set(key, value) };
  const first = { key: "catalog:english", game: { target: "english" }, title: "Game" };
  const second = { key: "catalog:french", game: { target: "french" }, title: "Game" };
  const group = { ...first, key: "family:game", versions: [first, second] };
  writeHiddenCatalogVersions([first.key, first.key], storage);
  assert.deepEqual(readHiddenCatalogVersions(storage), [first.key]);
  const [visible] = visibleLibraryGroups([group], readHiddenCatalogVersions(storage));
  assert.equal(visible.key, group.key);
  assert.equal(visible.game.target, "french");
  assert.deepEqual(visible.versions, [second]);
  assert.deepEqual(group.versions, [first, second], "original catalog is unchanged");
  writeHiddenCatalogVersions([first.key, second.key], storage);
  assert.deepEqual(visibleLibraryGroups([group], readHiddenCatalogVersions(storage)), []);
  writeHiddenCatalogVersions([], storage);
  assert.equal(visibleLibraryGroups([group], readHiddenCatalogVersions(storage))[0], group);
  assert.equal(values.get("/saves/game.001"), "save bytes");
  assert.equal(values.get("scummweb.save-namespace.v1:source:original"), "original namespace");
});

test("unavailable preference storage fails visibly instead of pretending removal persisted", () => {
  assert.throws(() => writeHiddenCatalogVersions(["catalog:game"], { setItem() { throw new Error("Storage blocked"); } }), /Storage blocked/);
  assert.throws(() => readHiddenCatalogVersions({ getItem: () => "{}" }), /Could not read/);
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
