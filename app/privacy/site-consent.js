"use client";

import { useSyncExternalStore } from "react";
import { ConsentControls } from "../../lib/privacy-consent/controls";
import SiteAnalytics from "../site-analytics";
import { consentPurposes, consentStore } from "./consent-config.mjs";

export default function SiteConsent({ children }) {
  const record = useSyncExternalStore(consentStore.subscribe, consentStore.getSnapshot, consentStore.getServerSnapshot);

  return <ConsentControls message="Optional analytics and error reports help us fix slow loads and crashes."
    policyUrl="/privacy" purposes={consentPurposes} store={consentStore}>
    {children}
    <SiteAnalytics allowed={record?.choices.analytics === true} />
  </ConsentControls>;
}
