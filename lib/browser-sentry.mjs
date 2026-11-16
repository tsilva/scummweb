import { getSentryOptions, isSentryEnabled } from "../sentry.runtime.config.js";

export function createBrowserSentry({ enabled, load, options }) {
  let loading;
  let ready;
  const listeners = new Set();
  function start() {
    if (!enabled) return Promise.resolve(null);
    loading ??= Promise.resolve().then(load).then((sdk) => {
      sdk.init(options);
      ready = sdk;
      for (const listener of listeners) listener();
      listeners.clear();
      return sdk;
    }).catch((error) => {
      loading = undefined;
      throw error;
    });
    return loading;
  }
  function run(action) {
    return start().then((sdk) => sdk && action(sdk)).catch(() => {
      // A blocked monitoring download must not break navigation or gameplay.
    });
  }
  function onReady(listener) {
    if (ready) listener();
    else listeners.add(listener);
    return () => listeners.delete(listener);
  }
  return { start, run, onReady };
}

export function scheduleBrowserSentry(client, target = window) {
  const document = target.document;
  let stopped = false;
  let frame;
  let unsubscribe = () => {};
  const error = (event) => {
    if (!event.message && !event.error) return;
    void client.run((sdk) => sdk.captureException(event.error || event.message, {
      mechanism: { handled: false, type: "auto.browser.global_handlers.onerror" },
    }));
  };
  const rejection = (event) => {
    void client.run((sdk) => sdk.captureException(event.reason, {
      mechanism: { handled: false, type: "auto.browser.global_handlers.onunhandledrejection" },
    }));
  };
  target.addEventListener("error", error);
  target.addEventListener("unhandledrejection", rejection);
  // Register error capture before hydration; load the full SDK after the
  // server-rendered hero has had a paint opportunity. Errors load it immediately.
  const paint = async () => {
    const hero = document.querySelector(".hero-stage-library .hero-backdrop-image");
    if (hero) await hero.decode().catch(() => {});
    if (stopped) return;
    frame = target.requestAnimationFrame(() => {
      if (stopped) return;
      frame = target.requestAnimationFrame(() => {
        if (!stopped) void client.start().catch(() => {});
      });
    });
  };
  function cleanup() {
    stopped = true;
    target.removeEventListener("error", error);
    target.removeEventListener("unhandledrejection", rejection);
    document.removeEventListener("DOMContentLoaded", paint);
    if (frame !== undefined) target.cancelAnimationFrame(frame);
    unsubscribe();
  }
  unsubscribe = client.onReady(cleanup);
  if (stopped) return cleanup;
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", paint, { once: true });
  else void paint();
  return cleanup;
}

const client = createBrowserSentry({
  enabled: isSentryEnabled("browser"),
  load: () => import("./browser-sentry-sdk.mjs"),
  options: getSentryOptions("browser"),
});

export function startBrowserSentry() {
  if (isSentryEnabled("browser")) return scheduleBrowserSentry(client);
}

export const withBrowserSentry = (action) => client.run(action);
export const captureException = (error, hint) => withBrowserSentry((sdk) => sdk.captureException(error, hint));
