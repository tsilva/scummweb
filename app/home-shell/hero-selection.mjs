import { getGameFamilyKey } from "../game-versions.mjs";

// The homepage spotlights included games, avoiding the last pick when possible.
export function chooseMobileHeroId(slides, previousId, random = Math.random) {
  const included = slides.filter(({ game, versions }) => !game.importRequired
    && versions.some((version) => !version.source));
  const alternatives = included.filter(({ id }) => id !== previousId);
  const candidates = alternatives.length ? alternatives : included;
  return candidates[Math.floor(random() * candidates.length)]?.id ?? null;
}

export function buildGameExitHref(game) {
  if (!game) return "/";
  if (game.href?.startsWith("/") && !game.href.startsWith("//")) return game.href;
  if (game.slug) return `/${encodeURIComponent(game.slug)}`;
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
