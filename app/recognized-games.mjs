import { addGameRoutes } from "../lib/catalog.mjs";
import { compareGameTitles } from "../lib/game-title-sort.mjs";
import { getGamePresentation, getRecognizedGamePresentations } from "./game-presentation.js";
import { getGameFamilyKey } from "./game-versions.mjs";

// Bundled games go first so their published URLs and playable editions win.
export function getRecognizedGames(bundledGames) {
  const games = bundledGames.map((game) => ({ ...getGamePresentation(game), importRequired: false }));
  const families = new Set(games.map(getGameFamilyKey));
  for (const game of getRecognizedGamePresentations()) {
    const family = getGameFamilyKey(game);
    if (families.has(family)) continue;
    families.add(family);
    games.push({ ...game, importRequired: true, badge: "Import your copy", tag: "Bring your own game" });
  }
  return addGameRoutes(games).sort((a, b) => compareGameTitles(a.displayTitle, b.displayTitle));
}
