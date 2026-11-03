import assert from "node:assert/strict";
import test from "node:test";
import { createGameLaunchAnalytics } from "../app/game-player/game-launch-analytics.mjs";
import { DEFAULT_SITE_URL, GOOGLE_ANALYTICS_ID } from "../lib/site-config.mjs";

test("catalog analytics shares one attempt and counts only visible, ready play time", (t) => {
  t.mock.timers.enable({ apis: ["Date", "setTimeout"] });
  const events = [];
  globalThis.document = Object.assign(new EventTarget(), { visibilityState: "visible" });
  globalThis.window = Object.assign(new EventTarget(), {
    location: { origin: DEFAULT_SITE_URL, search: "?launch_from=library", hash: "#continue" },
    performance: { now: () => Date.now() },
    gtag: (command, event, fields) => events.push({ command, event, fields }),
    setTimeout,
    clearTimeout,
  });
  t.after(() => {
    delete globalThis.window;
    delete globalThis.document;
  });

  const tracker = createGameLaunchAnalytics("beneath-a-steel-sky");
  tracker.start();
  tracker.start();
  assert.equal(tracker.watchPlayTime(), undefined);
  t.mock.timers.tick(2000);
  tracker.fail("first_frame_timeout");
  tracker.fail("startup_error");
  t.mock.timers.tick(500);
  tracker.confirm();
  tracker.confirm();

  const stop = tracker.watchPlayTime();
  t.mock.timers.tick(120_000);
  document.visibilityState = "hidden";
  document.dispatchEvent(new Event("visibilitychange"));
  t.mock.timers.tick(300_000);
  document.visibilityState = "visible";
  document.dispatchEvent(new Event("visibilitychange"));
  t.mock.timers.tick(60_000);
  stop(); // The iframe reloads to skip the intro.
  t.mock.timers.tick(300_000);

  const stopAfterReload = tracker.watchPlayTime();
  t.mock.timers.tick(119_999);
  assert.deepEqual(events.map(({ event }) => event), [
    "game_launch_attempt", "game_launch_failed", "game_launch",
  ]);
  t.mock.timers.tick(1);
  stopAfterReload();
  assert.equal(tracker.watchPlayTime(), undefined);

  const fields = {
    game_slug: "beneath-a-steel-sky",
    entry_point: "library",
    launch_mode: "continue",
    send_to: GOOGLE_ANALYTICS_ID,
  };
  assert.deepEqual(events, [
    { command: "event", event: "game_launch_attempt", fields },
    { command: "event", event: "game_launch_failed", fields: { ...fields, failure_reason: "first_frame_timeout" } },
    { command: "event", event: "game_launch", fields: { ...fields, load_time_ms: 2500 } },
    { command: "event", event: "game_play_milestone", fields: { ...fields, play_time_seconds: 300 } },
  ]);
});
