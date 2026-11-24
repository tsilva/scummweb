import { createConsentStore } from "../../lib/privacy-consent/store.mjs";

export const consentPurposes = [
  { id: "analytics", label: "Analytics", description: "Google Analytics and Vercel Web Analytics measure visits and game launches, including load times and play milestones." },
  { id: "diagnostics", label: "Error diagnostics", description: "Sentry receives browser errors and related technical details to help us fix problems." },
];

export const consentStore = createConsentStore({
  site: "scummweb",
  version: 1,
  purposes: consentPurposes.map(({ id }) => id),
});
