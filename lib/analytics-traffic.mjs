// Keep this function self-contained: analytics-startup serializes it into the head.
export function classifyAnalyticsTraffic(browserWindow, productionOrigin) {
  const storageKey = "scummweb:analytics:traffic";
  const allowed = new Set(["automated", "internal", "external"]);
  const query = new URLSearchParams(browserWindow.location.search);
  const declared = query.get("analytics_traffic") || browserWindow.__scummwebAnalyticsTraffic;
  let stored;
  try {
    if (allowed.has(declared)) {
      if (declared === "external") browserWindow.sessionStorage.removeItem(storageKey);
      else browserWindow.sessionStorage.setItem(storageKey, declared);
    }
    stored = browserWindow.sessionStorage.getItem(storageKey);
  } catch {
    // Storage may be unavailable; classification must never prevent startup.
  }

  const navigator = browserWindow.navigator || {};
  const userAgent = navigator.userAgent || "";
  if (navigator.webdriver === true) return { traffic_type: "automated", automation_reason: "webdriver" };
  if (/Chrome-Lighthouse|Lighthouse/i.test(userAgent)) {
    return { traffic_type: "automated", automation_reason: "lighthouse" };
  }
  if (/HeadlessChrome/i.test(userAgent)) return { traffic_type: "automated", automation_reason: "headless" };
  const traffic = allowed.has(declared) ? declared : stored;
  if (traffic === "automated") return { traffic_type: "automated", automation_reason: "declared" };
  if (browserWindow.location.origin !== productionOrigin || traffic === "internal") {
    return { traffic_type: "internal", automation_reason: "none" };
  }
  // External means unmarked, not verified human. Do not infer bots from country,
  // engagement, screen size, or an ordinary browser/operating-system combination.
  return { traffic_type: "external", automation_reason: "none" };
}
