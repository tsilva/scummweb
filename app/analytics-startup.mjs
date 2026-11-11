import { DEFAULT_SITE_URL, GOOGLE_ANALYTICS_ID } from "../lib/site-config.mjs";
import { classifyAnalyticsTraffic } from "../lib/analytics-traffic.mjs";

function startAnalytics(id, productionOrigin, classifyTraffic) {
  window.dataLayer = window.dataLayer || [];
  window.gtag = function () { window.dataLayer.push(arguments); };
  // Set before config so automatic page views and enhanced-measurement events
  // receive the same classification as the catalog funnel.
  window.gtag("set", classifyTraffic(window, productionOrigin));
  window.gtag("js", new Date());
  const { origin, pathname, search } = window.location;
  window.gtag("config", id, { page_location: origin + pathname + search });

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

export const analyticsStartupScript = `(${startAnalytics.toString()})(${JSON.stringify(GOOGLE_ANALYTICS_ID)},${JSON.stringify(DEFAULT_SITE_URL)},(${classifyAnalyticsTraffic.toString()}));`;
