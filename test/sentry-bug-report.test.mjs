import assert from "node:assert/strict";
import test from "node:test";
import Sentry from "@sentry/nextjs";
import { sendSentryBugReport } from "../lib/sentry-bug-report.mjs";

test("the real Sentry SDK sends feedback and save attachments, strips private context, and rejects failed ingestion", async (t) => {
  const envelopes = [];
  let statusCode = 200;
  Sentry.init({ dsn: "http://public@127.0.0.1:1/1", defaultIntegrations: [],
    sendClientReports: false, skipOpenTelemetrySetup: true,
    transport: () => ({
      send(envelope) { envelopes.push(envelope); return Promise.resolve({ statusCode }); },
      flush: async () => true,
    }),
  });
  t.after(() => Sentry.close());
  Sentry.setUser({ email: "private@example.test" });
  Sentry.addBreadcrumb({ message: "https://private.test/game.zip?token=secret" });
  Sentry.getCurrentScope().setContext("private", { path: "personal-file.zip" });
  const report = { message: "The sound stopped.", userAgent: "Test browser",
    manifest: { game: { source: "local", engineId: "sky", gameId: "sky" },
      capture: { status: "captured", slot: 1, files: [] }, runtimeVersion: "test-build" },
    attachments: [{ filename: "SKY-VM.001", data: new Uint8Array([1, 2, 3]), contentType: "application/octet-stream" }],
  };
  const id = await sendSentryBugReport(Sentry, report);
  const items = envelopes[0][1];
  const feedback = items.find(([header]) => header.type === "feedback")[1];
  assert.equal(feedback.event_id, id);
  assert.equal(feedback.contexts.feedback.message, report.message);
  assert.equal(feedback.tags.game_id, "sky");
  assert.doesNotMatch(JSON.stringify(feedback), /private|secret|personal-file/);
  assert.equal(items.find(([header]) => header.type === "attachment")[0].filename, "SKY-VM.001");
  assert.deepEqual([...items.find(([header]) => header.type === "attachment")[1]], [1, 2, 3]);
  statusCode = 429;
  await assert.rejects(sendSentryBugReport(Sentry, report), /delivery failed/);
});
