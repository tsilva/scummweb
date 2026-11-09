import { readQueenSaveSnapshot } from "../../lib/game-progress/queen-save.mjs";

const game = "flight-of-the-amazon-queen";
let trackerFactory;

async function loadTrackerFactory() {
  const response = await fetch("/game-progress/index.json");
  if (!response.ok) throw new Error("Story progress index unavailable");
  const index = await response.json();
  const revision = index.games?.[game]?.revision;
  if (index.schema_version !== 1 || typeof revision !== "string" || !/^[a-f0-9]{64}$/.test(revision)) {
    throw new Error("Queen story progress map unavailable");
  }
  const url = `/game-progress/v1.mjs?v=${revision}`;
  const { createTracker } = await import(/* webpackIgnore: true */ /* turbopackIgnore: true */ url);
  return () => createTracker(game, revision);
}

export async function getQueenSaveProgress(contents) {
  const snapshot = await readQueenSaveSnapshot(contents);
  if (!snapshot) return null;
  try {
    trackerFactory ??= loadTrackerFactory().catch(error => {
      trackerFactory = undefined;
      throw error;
    });
    const tracker = (await trackerFactory)();
    tracker.acceptSnapshot({ engine_id: "queen", game_id: "queen" }, snapshot);
    const report = tracker.report();
    return report.state === "tracked" ? report.percent : null;
  } catch {
    return null;
  }
}
