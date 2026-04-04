import * as Sentry from "@sentry/nextjs";

const isSentryEnabled = process.env.VERCEL_ENV === "production";

if (isSentryEnabled) {
  Sentry.init({
    dsn: "https://460d5b7993edd7fccf4cd9dd03790420@o4511061698478080.ingest.de.sentry.io/4511132899803216",
    enableLogs: true,
    sendDefaultPii: true,
    tracesSampleRate: 0.1,
  });
}

export const onRouterTransitionStart = isSentryEnabled
  ? Sentry.captureRouterTransitionStart
  : () => {};
