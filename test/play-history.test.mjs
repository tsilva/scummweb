import assert from "node:assert/strict";
import test from "node:test";
import { formatLastPlayed, formatPlayedTime, observePlayHistory } from "../app/game-player/play-history.mjs";
import { addPlayedTime, localActivityUpdatedEvent, readLocalActivity } from "../app/game-player/activity-storage.mjs";
import { indexedDbFixture, memoryStorage } from "./helpers/dropbox-fixtures.mjs";

function browser(indexedDB = indexedDbFixture(), localStorage = memoryStorage()) {
  let time = 0;
  let timer;
  const scope = Object.assign(new EventTarget(), {
    document: Object.assign(new EventTarget(), { visibilityState: "visible" }),
    performance: { now: () => time },
    indexedDB, localStorage,
    setInterval(callback) { timer = callback; return 1; },
    clearInterval() { timer = undefined; },
  });
  return { scope, advance(ms) { time += ms; }, tick() { timer?.(); },
    visibility(value) { scope.document.visibilityState = value; scope.document.dispatchEvent(new Event("visibilitychange")); } };
}

async function readPlayHistory(scope, version) {
  return (await readLocalActivity(scope)).get(version)?.history ?? null;
}

test("play history counts foreground intervals and flushes the final partial interval", async () => {
  const b = browser();
  let updates = 0;
  b.scope.addEventListener(localActivityUpdatedEvent, () => updates++);
  const stop = observePlayHistory(b.scope, "catalog:sky");
  assert.equal((await readPlayHistory(b.scope, "catalog:sky")).playedMs, 0);
  b.advance(20_000); b.tick();
  b.advance(5000); b.visibility("hidden");
  const history = await readPlayHistory(b.scope, "catalog:sky");
  assert.equal(history.playedMs, 25_000);
  b.advance(300_000); b.tick();
  assert.equal((await readPlayHistory(b.scope, "catalog:sky")).lastPlayedAt, history.lastPlayedAt);
  b.visibility("visible"); b.advance(30_000); await stop(); await stop();
  assert.equal((await readPlayHistory(b.scope, "catalog:sky")).playedMs, 55_000);
  b.advance(300_000); b.tick();
  assert.equal((await readPlayHistory(b.scope, "catalog:sky")).playedMs, 55_000);
  assert.equal(updates, 5);
});

test("pagehide and bfcache restoration exclude suspended time and sessions accumulate per copy", async () => {
  const b = browser();
  const stop = observePlayHistory(b.scope, "source:one");
  b.advance(12_000); b.scope.dispatchEvent(new Event("pagehide"));
  b.advance(300_000); b.tick();
  b.scope.dispatchEvent(new Event("pageshow"));
  b.advance(4000); await stop();
  assert.equal((await readPlayHistory(b.scope, "source:one")).playedMs, 16_000);
  b.advance(60_000); // Time in a menu or outside the player.
  const resume = observePlayHistory(b.scope, "source:one");
  b.advance(7000); await resume();
  assert.equal((await readPlayHistory(b.scope, "source:one")).playedMs, 23_000);
  assert.equal(await readPlayHistory(b.scope, "source:two"), null);
  const second = observePlayHistory(b.scope, "source:two");
  b.advance(2000); await second();
  assert.equal((await readPlayHistory(b.scope, "source:two")).playedMs, 2000);
  assert.equal((await readPlayHistory(b.scope, "source:one")).playedMs, 23_000);
});

test("a ready game opened in a hidden tab has no last-played date until visible", async () => {
  const b = browser();
  b.visibility("hidden");
  const stop = observePlayHistory(b.scope, "catalog:sky");
  b.advance(30_000); b.tick();
  assert.equal(await readPlayHistory(b.scope, "catalog:sky"), null);
  b.visibility("visible"); b.advance(2000); await stop();
  assert.equal((await readPlayHistory(b.scope, "catalog:sky")).playedMs, 2000);
});

test("invalid legacy history and blocked IndexedDB cannot prevent playback", async () => {
  for (const entry of ["invalid", "null", '{"playedMs":-1,"lastPlayedAt":1}',
    '{"playedMs":0,"lastPlayedAt":9007199254740991}']) {
    const b = browser();
    b.scope.localStorage.setItem("scummweb.play-history.v1:catalog:sky", entry);
    assert.equal(await readPlayHistory(b.scope, "catalog:sky"), null);
  }
  const b = browser({ open: () => { throw new Error("Storage blocked"); } });
  const stop = observePlayHistory(b.scope, "catalog:sky");
  b.advance(12_000); b.tick();
  await stop();
});

test("failed migration can retry and simultaneous tabs extend the same legacy total", async () => {
  const indexedDB = indexedDbFixture();
  const storage = memoryStorage();
  const first = browser(indexedDB, storage);
  const second = browser(indexedDB, storage);
  const version = "catalog:sky";
  const key = "scummweb.play-history.v1:" + version;
  const legacy = '{"playedMs":1000,"lastPlayedAt":100}';
  storage.setItem(key, legacy);
  indexedDB.fail = ({ mode }) => mode === "readwrite" ? new DOMException("full", "QuotaExceededError") : undefined;
  await assert.rejects(readLocalActivity(first.scope), { name: "QuotaExceededError" });
  assert.equal(storage.getItem(key), legacy);

  indexedDB.fail = null;
  await Promise.all([addPlayedTime(first.scope, version, 600, 120), addPlayedTime(second.scope, version, 900, 110)]);
  const reopened = browser(indexedDB, storage);
  assert.deepEqual(await readPlayHistory(reopened.scope, version), { playedMs: 2500, lastPlayedAt: 120 });
  assert.equal(storage.getItem(key), legacy);
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
