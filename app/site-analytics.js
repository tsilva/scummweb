"use client";

import { Analytics } from "@vercel/analytics/next";
import { useEffect, useState } from "react";

function omitGameZipFragment(event) {
  const url = new URL(event.url);
  if (new URLSearchParams(url.hash.slice(1)).has("zip")) {
    url.hash = "";
    return { ...event, url: url.href };
  }
  return event;
}

export default function SiteAnalytics() {
  const enabled = process.env.NEXT_PUBLIC_VERCEL_ANALYTICS_ENABLED === "true";
  const [ready, setReady] = useState(false);
  useEffect(() => {
    if (!enabled) return;
    const markReady = () => setReady(true);
    if (window.scummwebAnalyticsReady) markReady();
    else {
      window.addEventListener("scummweb:analytics-ready", markReady, { once: true });
      return () => window.removeEventListener("scummweb:analytics-ready", markReady);
    }
  }, [enabled]);
  return enabled && ready ? <Analytics beforeSend={omitGameZipFragment} /> : null;
}
