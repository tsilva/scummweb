import assert from "node:assert/strict";
import test from "node:test";
import { formatLastPlayed, formatPlayedTime, observePlayHistory, playHistoryUpdatedEvent, readPlayHistory } from "../app/game-player/play-history.mjs";

function browser() {
  let time = 0;
  let timer;
  const storage = new Map();
  const scope = Object.assign(new EventTarget(), {
    document: Object.assign(new EventTarget(), { visibilityState: "visible" }),
    performance: { now: () => time },
    localStorage: { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value) },
    setInterval(callback) { timer = callback; return 1; },
    clearInterval() { timer = undefined; },
  });
  return { scope, storage, advance(ms) { time += ms; }, tick() { timer?.(); },
    visibility(value) { scope.document.visibilityState = value; scope.document.dispatchEvent(new Event("visibilitychange")); } };
}

test("play history counts foreground intervals and flushes the final partial interval", () => {
  const b = browser();
  let updates = 0;
  b.scope.addEventListener(playHistoryUpdatedEvent, () => updates++);
  const stop = observePlayHistory(b.scope, "catalog:sky");
  assert.equal(readPlayHistory(b.scope, "catalog:sky").playedMs, 0);
  b.advance(20_000); b.tick();
  b.advance(5000); b.visibility("hidden");
  assert.equal(readPlayHistory(b.scope, "catalog:sky").playedMs, 25_000);
  const lastPlayed = readPlayHistory(b.scope, "catalog:sky").lastPlayedAt;
  b.advance(300_000); b.tick();
  assert.equal(readPlayHistory(b.scope, "catalog:sky").lastPlayedAt, lastPlayed);
  b.visibility("visible"); b.advance(30_000); stop(); stop();
  assert.equal(readPlayHistory(b.scope, "catalog:sky").playedMs, 55_000);
  b.advance(300_000); b.tick();
  assert.equal(readPlayHistory(b.scope, "catalog:sky").playedMs, 55_000);
  assert.equal(updates, 5);
});

test("pagehide and bfcache restoration exclude suspended time and sessions accumulate per copy", () => {
  const b = browser();
  const stop = observePlayHistory(b.scope, "source:one");
  b.advance(12_000); b.scope.dispatchEvent(new Event("pagehide"));
  b.advance(300_000); b.tick();
  b.scope.dispatchEvent(new Event("pageshow"));
  b.advance(4000); stop();
  assert.equal(readPlayHistory(b.scope, "source:one").playedMs, 16_000);
  b.advance(60_000); // Time in a menu or outside the player.
  const resume = observePlayHistory(b.scope, "source:one");
  b.advance(7000); resume();
  assert.equal(readPlayHistory(b.scope, "source:one").playedMs, 23_000);
  assert.equal(readPlayHistory(b.scope, "source:two"), null);
  const second = observePlayHistory(b.scope, "source:two");
  b.advance(2000); second();
  assert.equal(readPlayHistory(b.scope, "source:two").playedMs, 2000);
  assert.equal(readPlayHistory(b.scope, "source:one").playedMs, 23_000);
});

test("a ready game opened in a hidden tab has no last-played date until visible", () => {
  const b = browser();
  b.visibility("hidden");
  const stop = observePlayHistory(b.scope, "catalog:sky");
  b.advance(30_000); b.tick();
  assert.equal(readPlayHistory(b.scope, "catalog:sky"), null);
  b.visibility("visible"); b.advance(2000); stop();
  assert.equal(readPlayHistory(b.scope, "catalog:sky").playedMs, 2000);
});

test("invalid history and blocked storage cannot prevent playback", () => {
  const b = browser();
  for (const entry of ["invalid", "null", '{"playedMs":-1,"lastPlayedAt":1}',
    '{"playedMs":0,"lastPlayedAt":9007199254740991}']) {
    b.storage.set("scummweb.play-history.v1:catalog:sky", entry);
    assert.equal(readPlayHistory(b.scope, "catalog:sky"), null);
  }
  b.scope.localStorage.getItem = () => { throw new Error("Storage blocked"); };
  b.scope.localStorage.setItem = () => { throw new Error("Storage blocked"); };
  assert.doesNotThrow(() => {
    const stop = observePlayHistory(b.scope, "catalog:sky");
    b.advance(12_000); b.tick(); stop();
  });
});

test("play time and last played have readable boundaries without inventing legacy history", () => {
  assert.equal(formatPlayedTime(undefined), "—");
  assert.equal(formatPlayedTime(0), "<1m");
  assert.equal(formatPlayedTime(59_999), "<1m");
  assert.equal(formatPlayedTime(60_000), "1m");
  assert.equal(formatPlayedTime((4 * 60 + 6) * 60_000), "4h 6m");
  const now = 1_800_000_000_000;
  assert.equal(formatLastPlayed(undefined, now), "—");
  assert.equal(formatLastPlayed(now + 1000, now), "Just now");
  assert.equal(formatLastPlayed(now - 60_000, now), "1m ago");
  assert.equal(formatLastPlayed(now - 3_600_000, now), "1h ago");
  assert.equal(formatLastPlayed(now - 86_400_000, now), "1d ago");
});
