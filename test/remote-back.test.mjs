import assert from "node:assert/strict";
import test from "node:test";
import { observeRemoteBack } from "../app/game-player/remote-back.mjs";

test("TV Back detects fullscreen exit and cancels a browser back within the player document", () => {
  const document = Object.assign(new EventTarget(), { fullscreenElement: {}, hidden: false });
  const navigation = Object.assign(new EventTarget(), { currentEntry: { index: 2 } });
  const calls = [];
  const stop = observeRemoteBack({ document, navigation }, {
    onBack: () => calls.push("back"),
    onFullscreenExit: () => calls.push("fullscreen"),
  });
  document.fullscreenElement = null;
  document.dispatchEvent(new Event("fullscreenchange"));
  document.dispatchEvent(new Event("webkitfullscreenchange"));
  function traverse(index, overrides = {}) {
    return navigation.dispatchEvent(Object.assign(new Event("navigate", { cancelable: true }), {
      navigationType: "traverse",
      userInitiated: true,
      destination: { sameDocument: true, index },
      ...overrides,
    }));
  }
  assert.equal(traverse(3), true);
  assert.equal(traverse(1, { userInitiated: false }), true);
  assert.equal(traverse(1, { destination: { sameDocument: false, index: 1 } }), true);
  assert.equal(traverse(1), false);
  assert.deepEqual(calls, ["fullscreen", "back"]);
  stop();
  assert.equal(traverse(1), true);
});
