import { DEFAULT_SITE_URL, GOOGLE_ANALYTICS_ID } from "../lib/site-config.mjs";
import { classifyAnalyticsTraffic } from "../lib/analytics-traffic.mjs";

function startAnalytics(id, productionOrigin, classifyTraffic, window = globalThis.window, document = globalThis.document) {
  let canceled = false;
  window.dataLayer = window.dataLayer || [];
  window.gtag = function () {
    if (window[`ga-disable-${id}`] !== true) window.dataLayer.push(arguments);
  };
  // Set before config so automatic page views and enhanced-measurement events
  // receive the same classification as the catalog funnel.
  window.gtag("set", classifyTraffic(window, productionOrigin));
  window.gtag("js", new Date());
  const { origin, pathname } = window.location;
  const referrer = URL.canParse(document.referrer) ? new URL(document.referrer) : null;
  window.gtag("config", id, {
    page_location: origin + pathname,
    page_referrer: referrer ? referrer.origin + referrer.pathname : "",
    cookie_domain: "none",
    cookie_expires: 180 * 24 * 60 * 60,
    cookie_update: false,
    allow_google_signals: false,
    allow_ad_personalization_signals: false,
  });

  function load() {
    if (canceled || window[`ga-disable-${id}`] === true || window.scummwebAnalyticsReady) return;
    const script = document.createElement("script");
    script.async = true;
    script.referrerPolicy = "no-referrer";
    script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(id)}`;
    document.head.appendChild(script);
    window.scummwebAnalyticsReady = true;
    window.dispatchEvent(new Event("scummweb:analytics-ready"));
  }

  function afterLoad() {
    // Let the loaded page paint before third-party analytics can use the main thread.
    window.requestAnimationFrame(() => window.requestAnimationFrame(() => {
      if (window.requestIdleCallback) window.requestIdleCallback(load, { timeout: 2000 });
      else window.setTimeout(load, 0);
    }));
  }

  if (document.readyState === "complete") afterLoad();
  else window.addEventListener("load", afterLoad, { once: true });
  return () => { canceled = true; };
}

export const analyticsStartupScript = `(${startAnalytics.toString()})(${JSON.stringify(GOOGLE_ANALYTICS_ID)},${JSON.stringify(DEFAULT_SITE_URL)},(${classifyAnalyticsTraffic.toString()}));`;

let cancelPending;
export function setGoogleAnalyticsAllowed(allowed, target = window) {
  const disableKey = `ga-disable-${GOOGLE_ANALYTICS_ID}`;
  const active = allowed && target.location.origin === DEFAULT_SITE_URL;
  if (target[disableKey] === !active) return;
  target[disableKey] = !active;
  target.scummwebAnalyticsRevision = (target.scummwebAnalyticsRevision || 0) + 1;

  if (active) {
    if (!target.scummwebAnalyticsReady) {
      cancelPending = startAnalytics(GOOGLE_ANALYTICS_ID, DEFAULT_SITE_URL, classifyAnalyticsTraffic, target, target.document);
    }
    return;
  }
  if (cancelPending && !target.scummwebAnalyticsReady) {
    cancelPending();
    target.dataLayer.length = 0;
  }
  cancelPending = undefined;
  if (target.location.origin === DEFAULT_SITE_URL) {
    for (const name of ["_ga", `_ga_${GOOGLE_ANALYTICS_ID.slice(2)}`]) {
      target.document.cookie = `${name}=; Path=/; Max-Age=0; Secure; SameSite=Lax`;
    }
  }
}
