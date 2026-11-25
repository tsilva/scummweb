import { createConsentStore } from "../../lib/privacy-consent/store.mjs";

export const consentPurposes = [
  { id: "analytics", label: "Google Analytics", description: "Measures visits, game launches, load times, and play milestones." },
  { id: "diagnostics", label: "Error diagnostics", description: "Sentry receives browser errors and technical details to help fix problems." },
];

export const consentStore = createConsentStore({
  site: "scummweb",
  version: 2,
  purposes: consentPurposes.map(({ id }) => id),
});
