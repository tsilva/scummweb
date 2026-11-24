"use client";

import { useSyncExternalStore } from "react";
import { ConsentControls } from "../../lib/privacy-consent/controls";
import SiteAnalytics from "../site-analytics";
import { consentPurposes, consentStore } from "./consent-config.mjs";

export default function SiteConsent({ children }) {
  const record = useSyncExternalStore(consentStore.subscribe, consentStore.getSnapshot, consentStore.getServerSnapshot);

  return <ConsentControls title="Help improve ScummWEB"
    message="If you accept, optional analytics and error reports help us spot slow game loads and fix crashes."
    policyUrl="/privacy" purposes={consentPurposes} store={consentStore}>
    {children}
    <SiteAnalytics allowed={record?.choices.analytics === true} />
  </ConsentControls>;
}
