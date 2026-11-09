import { readQueenSaveSnapshot } from "../../lib/game-progress/queen-save.mjs";
import { createStoryTracker } from "./story-progress.mjs";

export async function getQueenSaveProgress(contents, revision) {
  const snapshot = await readQueenSaveSnapshot(contents);
  if (!snapshot) return null;
  try {
    const tracker = await createStoryTracker("flight-of-the-amazon-queen", revision);
    tracker.acceptSnapshot({ engine_id: "queen", game_id: "queen" }, snapshot);
    const report = tracker.report();
    return report.state === "tracked" ? report.percent : null;
  } catch {
    return null;
  }
}
