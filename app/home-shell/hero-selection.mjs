import { getGameFamilyKey } from "../game-versions.mjs";

export function buildGameExitHref(game) {
  if (!game) return "/";
  const key = getGameFamilyKey(game)
    || game.recentGameId
    || (game.saveVersionId ? `source:${game.saveVersionId}` : null)
    || (game.target ? `catalog:${game.target}` : null);
  return key ? `/#slide=${encodeURIComponent(key)}` : "/";
}

export function readHeroSelection(hash) {
  if (!hash.startsWith("#slide=")) return null;
  try {
    return decodeURIComponent(hash.slice(7)) || null;
  } catch {
    return null;
  }
}
