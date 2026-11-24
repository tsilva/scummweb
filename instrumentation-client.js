import { startBrowserSentry, withBrowserSentry } from "./lib/browser-sentry.mjs";
import { setGoogleAnalyticsAllowed } from "./app/analytics-startup.mjs";
import { consentStore } from "./app/privacy/consent-config.mjs";

const updateAnalyticsConsent = () => setGoogleAnalyticsAllowed(consentStore.allows("analytics"));
updateAnalyticsConsent();
consentStore.subscribe(updateAnalyticsConsent);
startBrowserSentry();

export function onRouterTransitionStart(...args) {
  void withBrowserSentry((sdk) => sdk.captureRouterTransitionStart(...args));
}
