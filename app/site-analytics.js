"use client";

import { Analytics } from "@vercel/analytics/next";
import { consentStore } from "./privacy/consent-config.mjs";

function omitGameZipFragment(event) {
  if (!consentStore.allows("analytics")) return null;
  const url = new URL(event.url);
  if (new URLSearchParams(url.hash.slice(1)).has("zip")) {
    url.hash = "";
    return { ...event, url: url.href };
  }
  return event;
}

export default function SiteAnalytics({ allowed }) {
  const enabled = process.env.NEXT_PUBLIC_VERCEL_ANALYTICS_ENABLED === "true";
  return enabled && allowed ? <Analytics beforeSend={omitGameZipFragment} /> : null;
}
