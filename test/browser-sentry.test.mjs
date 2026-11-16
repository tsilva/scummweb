import assert from "node:assert/strict";
import test from "node:test";
import Sentry from "@sentry/nextjs";
import { createBrowserSentry, scheduleBrowserSentry } from "../lib/browser-sentry.mjs";

const tick = () => new Promise((resolve) => setImmediate(resolve));

function fixture({ hero, loading = false } = {}) {
  const target = new EventTarget();
  target.document = new EventTarget();
  target.document.readyState = loading ? "loading" : "complete";
  target.document.querySelector = () => hero;
  const frames = new Map();
  let next = 0;
  target.requestAnimationFrame = (callback) => { frames.set(++next, callback); return next; };
  target.cancelAnimationFrame = (id) => frames.delete(id);
  const frame = () => {
    const callbacks = [...frames.values()];
    frames.clear();
    callbacks.forEach((callback) => callback());
  };
  return { target, frames, frame };
}

test("monitoring waits for hero decoding and a paint opportunity, then initializes once", async () => {
  let decode;
  const f = fixture({ hero: { decode: () => new Promise((resolve) => { decode = resolve; }) } });
  let loads = 0, inits = 0;
  const options = { enabled: true, tracesSampleRate: 0.1, enableLogs: true };
  const sdk = { init(value) { assert.equal(value, options); inits++; } };
  const client = createBrowserSentry({ enabled: true, load: async () => { loads++; return sdk; }, options });
  scheduleBrowserSentry(client, f.target);
  await tick();
  assert.equal(loads, 0);
  assert.equal(f.frames.size, 0);
  decode();
  await tick();
  f.frame();
  await tick();
  assert.equal(loads, 0);
  f.frame();
  await client.start();
  assert.equal(await client.start(), sdk);
  assert.equal(loads, 1);
  assert.equal(inits, 1);
});

test("early errors, rejections and application reports force loading and survive until ready", async () => {
  const f = fixture({ hero: { decode: () => new Promise(() => {}) } });
  let finishLoad, loads = 0, sdkErrors = 0;
  const captured = [];
  const sdk = {
    init() { f.target.addEventListener("error", () => { sdkErrors++; }); },
    captureException: (...args) => captured.push(args),
  };
  const client = createBrowserSentry({ enabled: true, load: () => {
    loads++;
    return new Promise((resolve) => { finishLoad = resolve; });
  } });
  scheduleBrowserSentry(client, f.target);
  const error = new Error("early hydration failure");
  f.target.dispatchEvent(Object.assign(new Event("error"), { error, message: error.message }));
  f.target.dispatchEvent(Object.assign(new Event("unhandledrejection"), { reason: "early rejection" }));
  const report = client.run((sdk) => sdk.captureException("application report"));
  await tick();
  assert.equal(loads, 1);
  assert.deepEqual(captured, []);
  finishLoad(sdk);
  await report;
  assert.equal(captured[0][0], error);
  assert.deepEqual(captured[0][1], { mechanism: { handled: false, type: "auto.browser.global_handlers.onerror" } });
  assert.deepEqual(captured[1], ["early rejection", { mechanism: { handled: false, type: "auto.browser.global_handlers.onunhandledrejection" } }]);
  assert.deepEqual(captured[2], ["application report"]);
  f.target.dispatchEvent(Object.assign(new Event("error"), { error, message: error.message }));
  await tick();
  assert.equal(captured.length, 3, "temporary listeners are removed as soon as the SDK takes over");
  assert.equal(sdkErrors, 1);
});

test("failed images and routes without a hero still initialize; cleanup cancels scheduled work", async () => {
  for (const hero of [undefined, { decode: async () => { throw new Error("image unavailable"); } }]) {
    const f = fixture({ hero, loading: true });
    let loads = 0;
    const client = createBrowserSentry({ enabled: true, load: async () => { loads++; return { init() {} }; } });
    const cleanup = scheduleBrowserSentry(client, f.target);
    assert.equal(f.frames.size, 0);
    f.target.document.dispatchEvent(new Event("DOMContentLoaded"));
    await tick();
    assert.equal(f.frames.size, 1);
    cleanup();
    f.frame();
    await tick();
    assert.equal(loads, 0);
    assert.equal(f.frames.size, 0);
  }
  const f = fixture();
  let initialized = 0;
  const client = createBrowserSentry({ enabled: true, load: async () => ({ init() { initialized++; } }) });
  scheduleBrowserSentry(client, f.target);
  f.frame(); f.frame();
  await client.start();
  assert.equal(initialized, 1);
});

test("disabled monitoring never downloads; a failed download permits a later report to retry", async () => {
  const disabled = createBrowserSentry({ enabled: false, load() { assert.fail("disabled SDK downloaded"); } });
  assert.equal(await disabled.start(), null);
  await disabled.run(() => assert.fail("disabled report sent"));
  let calls = 0, reported = 0;
  const client = createBrowserSentry({ enabled: true, load: async () => {
    if (++calls === 1) throw new Error("network failure");
    return { init() {}, captureException() { reported++; } };
  } });
  await client.run((sdk) => sdk.captureException("first"));
  await client.run((sdk) => sdk.captureException("second"));
  assert.equal(calls, 2);
  assert.equal(reported, 1);
});

test("queued errors reach the real SDK transport with their original stack and unhandled mechanism", async (t) => {
  const envelopes = [];
  t.after(() => Sentry.close());
  const client = createBrowserSentry({ enabled: true, load: async () => Sentry, options: {
    dsn: "http://public@127.0.0.1:1/1", defaultIntegrations: [], skipOpenTelemetrySetup: true,
    sendClientReports: false, transport: () => ({
      send(envelope) { envelopes.push(envelope); return Promise.resolve({ statusCode: 200 }); },
      flush: async () => true,
    }),
  } });
  const original = new Error("early failure retained");
  await client.run((sdk) => sdk.captureException(original, { mechanism: { handled: false, type: "auto.browser.global_handlers.onerror" } }));
  await Sentry.flush(1000);
  const event = envelopes.flatMap(([, items]) => items).find(([header]) => header.type === "event")[1];
  const exception = event.exception.values[0];
  assert.equal(exception.value, original.message);
  assert.equal(exception.mechanism.handled, false);
  assert.equal(exception.mechanism.type, "auto.browser.global_handlers.onerror");
  assert.ok(exception.stacktrace.frames.some(({ filename }) => filename.endsWith("browser-sentry.test.mjs")));
});
