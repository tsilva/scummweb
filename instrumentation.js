import * as Sentry from "@sentry/nextjs";

const isSentryEnabled = process.env.VERCEL_ENV === "production";

export async function register() {
  if (!isSentryEnabled) {
    return;
  }

  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./sentry.server.config");
  }

  if (process.env.NEXT_RUNTIME === "edge") {
    await import("./sentry.edge.config");
  }
}

export function onRequestError(...args) {
  if (!isSentryEnabled) {
    return;
  }

  return Sentry.captureRequestError(...args);
}
