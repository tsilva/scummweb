import { randomUUID } from "node:crypto";

export async function sendSentryBugReport(Sentry, { message, manifest, attachments, userAgent }) {
  const client = Sentry.getClient();
  if (!client) throw new Error("Reporting is unavailable");
  const eventId = randomUUID().replaceAll("-", "");
  let timer, unsubscribe;
  const accepted = new Promise((resolve) => {
    timer = setTimeout(() => resolve(false), 5000);
    unsubscribe = client.on("afterSendEvent", (event, response) => {
      if (event.event_id === eventId) resolve(response?.statusCode >= 200 && response.statusCode < 300);
    });
  });
  try {
    const scope = new Sentry.Scope();
    scope.setClient(client);
    // Keep request cookies, private ZIP URLs and breadcrumbs out of reports.
    scope.addEventProcessor((event) => ({
        event_id: event.event_id, timestamp: event.timestamp, type: event.type, level: event.level,
        environment: event.environment, release: event.release, platform: event.platform,
        contexts: { feedback: event.contexts?.feedback, game: manifest.game,
          diagnostic: { ...manifest.capture, runtime_version: manifest.runtimeVersion, user_agent: userAgent } },
        tags: { component: "bug-report", game_source: manifest.game.source,
          game_engine: manifest.game.engineId, game_id: manifest.game.gameId,
          game_target: manifest.game.target, snapshot_status: manifest.capture.status },
    }));
    Sentry.captureFeedback({ message, source: "scummweb-game-menu" }, { event_id: eventId, attachments }, scope);
    if (!await Sentry.flush(5000) || !await accepted) throw new Error("Report delivery failed");
    return eventId;
  } finally {
    clearTimeout(timer);
    unsubscribe?.();
  }
}
