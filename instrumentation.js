import * as Sentry from "@sentry/nextjs";
import { isSentryEnabled } from "./sentry.runtime.config";

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs" && isSentryEnabled("server")) {
    await import("./sentry.server.config");
  }

  if (process.env.NEXT_RUNTIME === "edge" && isSentryEnabled("edge")) {
    await import("./sentry.edge.config");
  }
}

export function onRequestError(...args) {
  const target = process.env.NEXT_RUNTIME === "edge" ? "edge" : "server";

  if (!isSentryEnabled(target)) {
    return;
  }

  return Sentry.captureRequestError(...args);
}
