import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { runInNewContext } from "node:vm";
import { analyticsStartupScript } from "../app/analytics-startup.mjs";
import { createGameLaunchAnalytics } from "../app/game-player/game-launch-analytics.mjs";
import { DEFAULT_SITE_URL, GOOGLE_ANALYTICS_ID } from "../lib/site-config.mjs";
import { classifyAnalyticsTraffic } from "../lib/analytics-traffic.mjs";

function trafficWindow(url = DEFAULT_SITE_URL, navigator = {}) {
  const storage = new Map();
  return {
    location: new URL(url), navigator,
    sessionStorage: {
      getItem: (key) => storage.get(key) ?? null,
      setItem: (key, value) => storage.set(key, value),
      removeItem: (key) => storage.delete(key),
    },
  };
}

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
  const config = window.dataLayer.find(([command]) => command === "config");
  assert.equal(config[2].page_location, `${DEFAULT_SITE_URL}/local/play?example=1`);
  assert.equal(window.dataLayer.at(-1)[1], "game_launch_attempt");
  assert.equal(window.dataLayer[0][0], "set");
  assert.equal(window.dataLayer[0][1].traffic_type, "external");
  assert.equal(scripts.length, 0);
  window.dispatchEvent(new Event("load"));
  frames.shift()();
  frames.shift()();
  assert.equal(scripts.length, 0);
  idle();
  assert.equal(window.scummwebAnalyticsReady, true);
  assert.equal(scripts[0].src, `https://www.googletagmanager.com/gtag/js?id=${GOOGLE_ANALYTICS_ID}`);
});

test("traffic classification identifies declared automation, webdriver, Lighthouse, and internal visits", () => {
  for (const navigator of [{ webdriver: true }, { userAgent: "Chrome-Lighthouse" }, { userAgent: "HeadlessChrome/123" }]) {
    assert.equal(classifyAnalyticsTraffic(trafficWindow(DEFAULT_SITE_URL, navigator), DEFAULT_SITE_URL).traffic_type, "automated");
  }
  const external = trafficWindow();
  assert.deepEqual(classifyAnalyticsTraffic(external, DEFAULT_SITE_URL), { traffic_type: "external", automation_reason: "none" });
  external.__scummwebAnalyticsTraffic = "automated";
  assert.equal(classifyAnalyticsTraffic(external, DEFAULT_SITE_URL).traffic_type, "automated");
  assert.equal(classifyAnalyticsTraffic(trafficWindow("http://localhost:3000"), DEFAULT_SITE_URL).traffic_type, "internal");
});

test("explicit traffic tags survive navigation, can be cleared, and tolerate blocked storage", () => {
  const browser = trafficWindow(`${DEFAULT_SITE_URL}/?analytics_traffic=internal`);
  assert.equal(classifyAnalyticsTraffic(browser, DEFAULT_SITE_URL).traffic_type, "internal");
  browser.location = new URL(`${DEFAULT_SITE_URL}/beneath-a-steel-sky/play`);
  assert.equal(classifyAnalyticsTraffic(browser, DEFAULT_SITE_URL).traffic_type, "internal");
  browser.location.search = "?analytics_traffic=external";
  assert.equal(classifyAnalyticsTraffic(browser, DEFAULT_SITE_URL).traffic_type, "external");
  browser.location.search = "?analytics_traffic=untrusted-value";
  assert.equal(classifyAnalyticsTraffic(browser, DEFAULT_SITE_URL).traffic_type, "external");
  browser.location.search = "?analytics_traffic=automated";
  Object.defineProperty(browser, "sessionStorage", { get() { throw new Error("Storage blocked"); } });
  assert.equal(classifyAnalyticsTraffic(browser, DEFAULT_SITE_URL).traffic_type, "automated");
  browser.location.search = "";
  assert.equal(classifyAnalyticsTraffic(browser, DEFAULT_SITE_URL).traffic_type, "external");
});

test("automatic page views are tagged before config even when analytics loads later", () => {
  const window = Object.assign(new EventTarget(), trafficWindow(`${DEFAULT_SITE_URL}/?analytics_traffic=automated`));
  const document = { readyState: "loading" };
  runInNewContext(analyticsStartupScript, { window, document, URLSearchParams, Event });
  assert.equal(window.dataLayer[0][0], "set");
  assert.equal(window.dataLayer[0][1].traffic_type, "automated");
  assert.equal(window.dataLayer[2][0], "config");
});

test("catalog analytics shares one attempt and counts only visible, ready play time", (t) => {
  t.mock.timers.enable({ apis: ["Date", "setTimeout"] });
  const events = [];
  globalThis.document = Object.assign(new EventTarget(), { visibilityState: "visible" });
  globalThis.window = Object.assign(new EventTarget(), {
    location: { origin: DEFAULT_SITE_URL, search: "?launch_from=library", hash: "#continue" },
    performance: { now: () => Date.now() },
    crypto: { randomUUID },
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
    "game_play_30s", "game_play_60s",
  ]);
  t.mock.timers.tick(1);
  stopAfterReload();
  assert.equal(tracker.watchPlayTime(), undefined);

  const fields = {
    launch_id: events[0].fields.launch_id,
    game_slug: "beneath-a-steel-sky",
    entry_point: "library",
    launch_mode: "continue",
    traffic_type: "external",
    automation_reason: "none",
    send_to: GOOGLE_ANALYTICS_ID,
  };
  assert.deepEqual(events, [
    { command: "event", event: "game_launch_attempt", fields },
    { command: "event", event: "game_launch_failed", fields: { ...fields, failure_reason: "first_frame_timeout" } },
    { command: "event", event: "game_launch", fields: { ...fields, load_time_ms: 2500 } },
    { command: "event", event: "game_play_30s", fields: { ...fields, play_time_seconds: 30 } },
    { command: "event", event: "game_play_60s", fields: { ...fields, play_time_seconds: 60 } },
    { command: "event", event: "game_play_milestone", fields: { ...fields, play_time_seconds: 300 } },
  ]);
  assert.match(fields.launch_id, /^[a-f0-9-]{36}$/);
  const nextVisit = createGameLaunchAnalytics("beneath-a-steel-sky");
  nextVisit.start();
  assert.notEqual(events.at(-1).fields.launch_id, fields.launch_id);
});

test("short milestones fire at visible-time boundaries, pause on pagehide, and never double-count watchers", (t) => {
  t.mock.timers.enable({ apis: ["Date", "setTimeout"] });
  const events = [];
  globalThis.document = Object.assign(new EventTarget(), { visibilityState: "visible" });
  globalThis.window = Object.assign(new EventTarget(), trafficWindow(), {
    crypto: { randomUUID }, performance: { now: () => Date.now() },
    gtag: (command, name, fields) => events.push({ name, fields }), setTimeout, clearTimeout,
  });
  t.after(() => { delete globalThis.window; delete globalThis.document; });
  const tracker = createGameLaunchAnalytics("beneath-a-steel-sky");
  tracker.start();
  tracker.confirm();
  const oldStop = tracker.watchPlayTime();
  t.mock.timers.tick(15_000);
  const stop = tracker.watchPlayTime();
  oldStop();
  t.mock.timers.tick(14_999);
  assert.equal(events.length, 2);
  t.mock.timers.tick(1);
  assert.equal(events.at(-1).name, "game_play_30s");
  window.dispatchEvent(new Event("pagehide"));
  t.mock.timers.tick(300_000);
  assert.equal(events.length, 3);
  window.dispatchEvent(new Event("pageshow"));
  t.mock.timers.tick(30_000);
  assert.equal(events.at(-1).name, "game_play_60s");
  stop();
  stop();
  t.mock.timers.tick(300_000);
  assert.equal(events.length, 4);
});
