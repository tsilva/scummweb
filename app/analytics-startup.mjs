import { GOOGLE_ANALYTICS_ID } from "../lib/site-config.mjs";

function startAnalytics(id) {
  window.dataLayer = window.dataLayer || [];
  window.gtag = function () { window.dataLayer.push(arguments); };
  window.gtag("js", new Date());
  const { origin, pathname, search, hash } = window.location;
  window.gtag("config", id, new URLSearchParams(hash.slice(1)).has("zip")
    ? { page_location: origin + pathname + search } : {});

  function load() {
    const script = document.createElement("script");
    script.async = true;
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
}

export const analyticsStartupScript = `(${startAnalytics.toString()})(${JSON.stringify(GOOGLE_ANALYTICS_ID)});`;
