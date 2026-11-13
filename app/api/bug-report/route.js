import * as Sentry from "@sentry/nextjs";
import { getGameLibrary } from "../../game-library";
import { isSentryEnabled } from "../../../sentry.runtime.config";
import { createBugReportHandler } from "../../../lib/bug-report-handler.mjs";
import { sendSentryBugReport } from "../../../lib/sentry-bug-report.mjs";

export const runtime = "nodejs";

export const POST = createBugReportHandler({
  enabled: () => isSentryEnabled("server") && Boolean(Sentry.getClient()),
  games: () => getGameLibrary().games,
  send: (report) => sendSentryBugReport(Sentry, report),
});
