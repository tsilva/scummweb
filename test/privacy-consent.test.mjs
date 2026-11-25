import assert from "node:assert/strict";
import test from "node:test";
import { GET as privacyPrompt } from "../app/api/privacy-prompt/route.js";
import { createConsentStore } from "../lib/privacy-consent/store.mjs";
import { setGoogleAnalyticsAllowed } from "../app/analytics-startup.mjs";
import { DEFAULT_SITE_URL, GOOGLE_ANALYTICS_ID } from "../lib/site-config.mjs";

test("the privacy prompt is regional, defaults to showing, and cannot be cached", async () => {
  for (const [country, showPrompt, countryKnown] of [
    ["US", false, true], ["PT", true, true], ["CA", false, true], ["GB", true, true], [" jp ", false, true],
    ["IS", true, true], ["LI", true, true], ["NO", true, true], [null, true, false], ["XX", true, false],
    ["T1", true, false], ["ZZ", true, false], ["US, PT", true, false],
  ]) {
    const request = new Request(`${DEFAULT_SITE_URL}/api/privacy-prompt`, {
      headers: country === null ? {} : { "CF-IPCountry": country },
    });
    const response = privacyPrompt(request);
    assert.equal(response.headers.get("cache-control"), "private, no-store");
    assert.deepEqual(await response.json(), { showPrompt, countryKnown }, JSON.stringify(country));
  }
});

test("saved preferences are site-specific and require the current notice version", () => {
  const values = new Map();
  const target = Object.assign(new EventTarget(), { localStorage: {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  } });
  const options = { site: "game", version: 1, purposes: ["analytics", "diagnostics"], getWindow: () => target, now: () => 123 };
  const consent = createConsentStore(options);
  assert.equal(consent.getSnapshot(), null);
  assert.equal(consent.allows("analytics"), false);
  consent.decide({ analytics: true, diagnostics: false });
  assert.deepEqual(createConsentStore(options).getSnapshot(), {
    version: 1, decidedAt: 123, choices: { analytics: true, diagnostics: false },
  });
  assert.equal(createConsentStore({ ...options, version: 2 }).allows("analytics"), false);
  assert.equal(createConsentStore({ ...options, site: "other" }).allows("analytics"), false);
});

test("storage events apply withdrawal immediately and blocked storage stays usable", () => {
  const target = new EventTarget();
  Object.defineProperty(target, "localStorage", { get() { throw new Error("Blocked"); } });
  const consent = createConsentStore({ site: "game", version: 1, purposes: ["analytics"], getWindow: () => target });
  const observed = [];
  const unsubscribe = consent.subscribe(() => observed.push(consent.allows("analytics")));
  consent.decide({ analytics: true });
  target.dispatchEvent(Object.assign(new Event("storage"), { key: "privacy-consent:game", newValue: null }));
  unsubscribe();
  assert.deepEqual(observed, [true, false]);
  assert.equal(consent.getSnapshot(), null);
});

test("Google tag stays unloaded before consent and cancels a pending load on withdrawal", () => {
  const scripts = [];
  const frames = [];
  let idle;
  const target = Object.assign(new EventTarget(), {
    location: new URL(DEFAULT_SITE_URL),
    requestAnimationFrame: (callback) => frames.push(callback),
    requestIdleCallback: (callback) => { idle = callback; },
    document: { readyState: "complete", createElement: () => ({}), head: { appendChild: (script) => scripts.push(script) } },
  });
  const flush = () => {
    while (frames.length) frames.shift()();
    idle?.();
  };
  setGoogleAnalyticsAllowed(false, target);
  assert.equal(target.gtag, undefined);
  setGoogleAnalyticsAllowed(true, target);
  target.gtag("event", "queued");
  setGoogleAnalyticsAllowed(false, target);
  flush();
  assert.deepEqual(target.dataLayer, []);
  assert.deepEqual(scripts, []);
  setGoogleAnalyticsAllowed(true, target);
  flush();
  assert.equal(scripts.length, 1);
  setGoogleAnalyticsAllowed(false, target);
  assert.equal(target[`ga-disable-${GOOGLE_ANALYTICS_ID}`], true);
  const queueLength = target.dataLayer.length;
  target.gtag("event", "after withdrawal");
  assert.equal(target.dataLayer.length, queueLength);
});
