const RECENT_GAMES_STORAGE_KEY = "scummweb.recentGames";
const MAX_RECENT_GAMES = 12;
export const recentGamesUpdatedEvent = "scummweb:recent-games-updated";

function normalizeRecentGameTargets(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  const seenTargets = new Set();

  return value
    .filter((target) => typeof target === "string" && target.trim())
    .map((target) => target.trim())
    .filter((target) => {
      if (seenTargets.has(target)) {
        return false;
      }

      seenTargets.add(target);
      return true;
    });
}

export function getRecentGameTargets() {
  if (typeof window === "undefined") {
    return [];
  }

  try {
    const rawValue = window.localStorage.getItem(RECENT_GAMES_STORAGE_KEY);

    if (!rawValue) {
      return [];
    }

    return normalizeRecentGameTargets(JSON.parse(rawValue));
  } catch {
    return [];
  }
}

export function recordRecentGameTarget(target) {
  if (typeof window === "undefined" || typeof target !== "string" || !target.trim()) {
    return [];
  }

  const normalizedTarget = target.trim();
  const nextRecentTargets = [normalizedTarget, ...getRecentGameTargets().filter(
    (recentTarget) => recentTarget !== normalizedTarget
  )].slice(0, MAX_RECENT_GAMES);

  try {
    window.localStorage.setItem(RECENT_GAMES_STORAGE_KEY, JSON.stringify(nextRecentTargets));
    window.dispatchEvent(new Event(recentGamesUpdatedEvent));
  } catch {}

  return nextRecentTargets;
}

export function getRecentlyPlayedGames(groups, recentTargets) {
  const gamesById = new Map(groups.flatMap((group) => group.versions.map((version) => [
    version.source ? `source:${version.source.id}` : version.game.target,
    { ...group, game: version.game },
  ])));
  const seen = new Set();
  return normalizeRecentGameTargets(recentTargets).flatMap((id) => {
    const group = gamesById.get(id);
    if (!group || seen.has(group.key)) return [];
    seen.add(group.key);
    return [group];
  }).slice(0, MAX_RECENT_GAMES);
}
