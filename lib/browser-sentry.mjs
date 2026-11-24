import { getSentryOptions, isSentryEnabled } from "../sentry.runtime.config.js";
import { consentStore } from "../app/privacy/consent-config.mjs";

export function createBrowserSentry({ enabled, load, options }) {
  const allowed = typeof enabled === "function" ? enabled : () => enabled;
  let loading;
  let ready;
  let revision = 0;
  const listeners = new Set();
  function start() {
    if (!allowed()) return Promise.resolve(null);
    loading ??= Promise.resolve().then(load).then((sdk) => {
      if (!allowed()) {
        loading = undefined;
        return null;
      }
      sdk.init(options);
      const transport = sdk.getClient?.()?.getTransport();
      if (transport) {
        const send = transport.send.bind(transport);
        transport.send = (envelope) => allowed() ? send(envelope) : Promise.resolve({});
      }
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
    const startedAt = revision;
    return start().then((sdk) => {
      if (sdk && allowed() && revision === startedAt) return action(sdk);
    }).catch(() => {
      // A blocked monitoring download must not break navigation or gameplay.
    });
  }
  function onReady(listener) {
    if (ready) listener();
    else listeners.add(listener);
    return () => listeners.delete(listener);
  }
  function setActive(active) {
    revision++;
    const options = ready?.getClient?.()?.getOptions();
    if (options) options.enabled = active;
  }
  return { start, run, onReady, setActive };
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

const diagnosticsAllowed = () => isSentryEnabled("browser") && consentStore.allows("diagnostics");
const filter = (event) => diagnosticsAllowed() ? event : null;
const client = createBrowserSentry({
  enabled: diagnosticsAllowed,
  load: () => import("./browser-sentry-sdk.mjs"),
  options: {
    ...getSentryOptions("browser"),
    beforeSend: filter,
    beforeSendTransaction: filter,
    beforeSendLog: filter,
    beforeBreadcrumb: filter,
    sendClientReports: false,
  },
});

export function startBrowserSentry() {
  if (!isSentryEnabled("browser")) return;
  let active = false;
  let cancel;
  function update() {
    const allowed = diagnosticsAllowed();
    if (active === allowed) return;
    active = allowed;
    client.setActive(active);
    if (active) cancel = scheduleBrowserSentry(client);
    else cancel?.();
  }
  update();
  return consentStore.subscribe(update);
}

export const withBrowserSentry = (action) => client.run(action);
export const captureException = (error, hint) => withBrowserSentry((sdk) => sdk.captureException(error, hint));
