"use client";

import { usePathname } from "next/navigation";
import { useSyncExternalStore } from "react";
import { ConsentControls } from "../../lib/privacy-consent/controls";
import SiteAnalytics from "../site-analytics";
import { consentPurposes, consentStore } from "./consent-config.mjs";

export default function SiteConsent({ children }) {
  const pathname = usePathname();
  const record = useSyncExternalStore(consentStore.subscribe, consentStore.getSnapshot, consentStore.getServerSnapshot);

  return <ConsentControls siteName="ScummWEB" message="Optional analytics and error reports help us fix slow loads and crashes."
    policyUrl="/privacy" purposes={consentPurposes} store={consentStore} showPrompt={pathname === "/"}>
    {children}
    <SiteAnalytics allowed={record?.choices.analytics === true} />
  </ConsentControls>;
}
