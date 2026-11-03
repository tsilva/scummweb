"use client";

import { Analytics } from "@vercel/analytics/next";

function omitGameZipFragment(event) {
  const url = new URL(event.url);
  if (url.pathname === "/local/play" && new URLSearchParams(url.hash.slice(1)).has("zip")) {
    url.hash = "";
    return { ...event, url: url.href };
  }
  return event;
}

export default function SiteAnalytics() {
  return <Analytics beforeSend={omitGameZipFragment} />;
}
