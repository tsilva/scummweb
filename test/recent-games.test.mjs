import assert from "node:assert/strict";
import test from "node:test";
import { getRecentGameTargets, getRecentlyPlayedGames, recordRecentGameTarget, recentGamesUpdatedEvent } from "../app/recent-games.js";

function catalogGroup(key, target = key) {
  return { key, dialogId: `game-${key}`, versions: [{ game: { target, displayTitle: key } }] };
}

function browserHistory(t, initial) {
  const previous = globalThis.window;
  let stored = initial;
  const events = [];
  globalThis.window = {
    localStorage: { getItem: () => stored, setItem: (_, value) => { stored = value; } },
    dispatchEvent: (event) => events.push(event.type),
  };
  t.after(() => {
    if (previous === undefined) delete globalThis.window;
    else globalThis.window = previous;
  });
  return events;
}

test("recent games contain only played titles in newest-first order", () => {
  const groups = [catalogGroup("sky"), catalogGroup("queen"), catalogGroup("sfinx")];
  assert.deepEqual(getRecentlyPlayedGames(groups, ["queen", "removed", "sky"]).map(({ key }) => key), ["queen", "sky"]);
  assert.deepEqual(getRecentlyPlayedGames(groups, []), []);
  assert.deepEqual(getRecentlyPlayedGames(groups, null), []);
  assert.equal(groups[0].key, "sky");
});

test("catalog and imported editions share one recent card with the latest edition's presentation", () => {
  const group = catalogGroup("sky");
  const imported = { source: { id: "local-sky.zip" }, game: { displayTitle: "Beneath a Steel Sky", target: "sky-import" } };
  group.versions.push(imported);
  const [recent] = getRecentlyPlayedGames([group], ["source:local-sky.zip", "sky"]);
  assert.equal(recent.dialogId, "game-sky");
  assert.equal(recent.game, imported.game);
  assert.equal(getRecentlyPlayedGames([group], ["source:local-sky.zip", "sky"]).length, 1);
});

test("imported ZIPs use source identity and their existing library dialog", () => {
  const game = { displayTitle: "Personal game" };
  const group = { key: "source:personal", dialogId: "library-personal", versions: [{ source: { id: "personal" }, game }] };
  const [recent] = getRecentlyPlayedGames([group], ["source:personal"]);
  assert.equal(recent.game, game);
  assert.equal(recent.dialogId, "library-personal");
  assert.deepEqual(getRecentlyPlayedGames([], ["source:personal"]), []);
});

test("history is normalized, deduplicated, and bounded to twelve recent games", (t) => {
  const events = browserHistory(t, JSON.stringify([" old ", "old", null, 123, "", "other"]));
  assert.deepEqual(getRecentGameTargets(), ["old", "other"]);
  recordRecentGameTarget("source:personal");
  recordRecentGameTarget("old");
  assert.deepEqual(getRecentGameTargets(), ["old", "source:personal", "other"]);
  for (let index = 0; index < 20; index++) recordRecentGameTarget(`game-${index}`);
  assert.equal(getRecentGameTargets().length, 12);
  assert.equal(getRecentGameTargets()[0], "game-19");
  assert.equal(events.length, 22);
  assert.ok(events.every((event) => event === recentGamesUpdatedEvent));
});

test("unavailable or invalid browser history does not prevent browsing or playback", (t) => {
  browserHistory(t, "invalid json");
  assert.deepEqual(getRecentGameTargets(), []);
  window.localStorage.getItem = () => { throw new Error("Unavailable"); };
  window.localStorage.setItem = () => { throw new Error("Unavailable"); };
  assert.deepEqual(getRecentGameTargets(), []);
  assert.deepEqual(recordRecentGameTarget("sky"), ["sky"]);
  assert.deepEqual(recordRecentGameTarget(undefined), []);
});
