"use client";

import { Analytics } from "@vercel/analytics/next";

function omitGameZipFragment(event) {
  const url = new URL(event.url);
  if (new URLSearchParams(url.hash.slice(1)).has("zip")) {
    url.hash = "";
    return { ...event, url: url.href };
  }
  return event;
}

export default function SiteAnalytics() {
  if (process.env.NEXT_PUBLIC_VERCEL_ANALYTICS_ENABLED !== "true") return null;
  return <Analytics beforeSend={omitGameZipFragment} />;
}
