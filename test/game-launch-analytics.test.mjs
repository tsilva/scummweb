import assert from "node:assert/strict";
import test from "node:test";
import { runInNewContext } from "node:vm";
import { analyticsStartupScript } from "../app/analytics-startup.mjs";
import { createGameLaunchAnalytics } from "../app/game-player/game-launch-analytics.mjs";
import { DEFAULT_SITE_URL, GOOGLE_ANALYTICS_ID } from "../lib/site-config.mjs";

test("analytics queues early events and redacts the direct ZIP link before the tag loads", () => {
  const frames = [];
  const scripts = [];
  let idle;
  const window = Object.assign(new EventTarget(), {
    location: new URL(`${DEFAULT_SITE_URL}/local/play?example=1#zip=https://example.com/private.zip`),
    requestAnimationFrame: (callback) => frames.push(callback),
    requestIdleCallback: (callback) => { idle = callback; },
  });
  const document = { readyState: "loading", createElement: () => ({}), head: { appendChild: (script) => scripts.push(script) } };
  runInNewContext(analyticsStartupScript, { window, document, URLSearchParams, Event });
  window.gtag("event", "game_launch_attempt");
  const config = window.dataLayer[1];
  assert.equal(config[2].page_location, `${DEFAULT_SITE_URL}/local/play?example=1`);
  assert.equal(window.dataLayer[2][1], "game_launch_attempt");
  assert.equal(scripts.length, 0);
  window.dispatchEvent(new Event("load"));
  frames.shift()();
  frames.shift()();
  assert.equal(scripts.length, 0);
  idle();
  assert.equal(window.scummwebAnalyticsReady, true);
  assert.equal(scripts[0].src, `https://www.googletagmanager.com/gtag/js?id=${GOOGLE_ANALYTICS_ID}`);
});

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
