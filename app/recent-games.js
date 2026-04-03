const RECENT_GAMES_STORAGE_KEY = "scummweb.recentGames";
const MAX_RECENT_GAMES = 12;

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
  } catch {}

  return nextRecentTargets;
}

export function sortGamesByRecentPlay(catalog, recentTargets) {
  const recentIndexByTarget = new Map(
    normalizeRecentGameTargets(recentTargets).map((target, index) => [target, index])
  );
  const originalIndexByTarget = new Map(catalog.map((game, index) => [game.target, index]));

  return [...catalog].sort((left, right) => {
    const leftRecentIndex = recentIndexByTarget.get(left.target);
    const rightRecentIndex = recentIndexByTarget.get(right.target);
    const leftHasRecentIndex = leftRecentIndex !== undefined;
    const rightHasRecentIndex = rightRecentIndex !== undefined;

    if (leftHasRecentIndex && rightHasRecentIndex) {
      return leftRecentIndex - rightRecentIndex;
    }

    if (leftHasRecentIndex) {
      return -1;
    }

    if (rightHasRecentIndex) {
      return 1;
    }

    return (originalIndexByTarget.get(left.target) ?? 0) - (originalIndexByTarget.get(right.target) ?? 0);
  });
}
