"use client";

import { usePathname } from "next/navigation";
import { useEffect, useState, useSyncExternalStore } from "react";
import { ConsentControls } from "../../lib/privacy-consent/controls";
import { consentPurposes, consentStore } from "./consent-config.mjs";

export default function SiteConsent({ children }) {
  const record = useSyncExternalStore(consentStore.subscribe, consentStore.getSnapshot, consentStore.getServerSnapshot);
  const pathname = usePathname();
  const [showFirstVisitPrompt, setShowFirstVisitPrompt] = useState(null);
  const needsRegionCheck = pathname === "/" && !record && showFirstVisitPrompt === null;

  useEffect(() => {
    if (!needsRegionCheck || consentStore.getSnapshot()) return;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);
    let active = true;

    async function checkPromptRegion() {
      try {
        const response = await fetch("/api/privacy-prompt", { cache: "no-store", signal: controller.signal });
        const result = response.ok ? await response.json() : null;
        if (active) setShowFirstVisitPrompt(result?.showPrompt !== false);
      } catch {
        if (active) setShowFirstVisitPrompt(true);
      } finally {
        clearTimeout(timeout);
      }
    }

    void checkPromptRegion();
    return () => {
      active = false;
      clearTimeout(timeout);
      controller.abort();
    };
  }, [needsRegionCheck]);

  return <ConsentControls title="Help improve ScummWEB"
    message="If you accept, optional analytics and error reports help us spot slow game loads and fix crashes."
    purposes={consentPurposes} store={consentStore} firstVisitPrompt={showFirstVisitPrompt === true}>
    {children}
  </ConsentControls>;
}
