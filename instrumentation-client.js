import * as Sentry from "@sentry/nextjs";
import { getSentryOptions, isSentryEnabled } from "./sentry.runtime.config";

const sentryEnabled = isSentryEnabled("browser");

if (sentryEnabled) {
  Sentry.init(getSentryOptions("browser"));
}

export const onRouterTransitionStart = sentryEnabled
  ? Sentry.captureRouterTransitionStart
  : () => {};
