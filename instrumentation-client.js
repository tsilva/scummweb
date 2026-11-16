import { startBrowserSentry, withBrowserSentry } from "./lib/browser-sentry.mjs";

startBrowserSentry();

export function onRouterTransitionStart(...args) {
  void withBrowserSentry((sdk) => sdk.captureRouterTransitionStart(...args));
}
