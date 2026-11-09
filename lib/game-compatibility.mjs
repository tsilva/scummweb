export const compatibilityStatusLabels = {
  "startup-verified": "Startup verified",
  "startup-warning": "Startup with warnings",
  "startup-failed": "Startup failed",
  "not-tested": "Not yet tested",
};

// Match engine identity and demo status, rather than potentially ambiguous titles.
export function buildCompatibilityPageEntries(entries, games) {
  const identity = (game) => game.familyId || `${game.engineId}:${game.gameId || game.target}`;
  const demo = (title, edition) => /\(Demo\)$/i.test(title) || /\bdemo\b/i.test(edition || "");
  const gameKey = (game) => `${identity(game)}:${demo(game.displayTitle, game.extra)}`;
  const byIdentity = new Map(games.map((game) => [gameKey(game), game]));
  const covered = new Set();
  const linked = entries.map((entry) => {
    const game = byIdentity.get(`${entry.gameId}:${demo(entry.title, entry.edition)}`);
    if (!game) return { ...entry };
    covered.add(game.href);
    return { ...entry, href: game.href };
  });
  for (const game of games) {
    if (!covered.has(game.href)) linked.push({
      title: game.displayTitle,
      gameId: identity(game),
      status: "not-tested",
      href: game.href,
    });
  }
  return linked;
}

export function getCompatibilitySummary(entries) {
  const verified = entries.filter((entry) => entry.status === "startup-verified");
  const checked = entries.filter((entry) => entry.status !== "not-tested");
  return {
    total: entries.length,
    verified: verified.length,
    verifiedGames: new Set(verified.map((entry) => entry.title)).size,
    warnings: entries.filter((entry) => entry.status === "startup-warning").length,
    failed: entries.filter((entry) => entry.status === "startup-failed").length,
    checked: checked.length,
    checkedGames: new Set(checked.map((entry) => entry.title)).size,
    untested: entries.filter((entry) => entry.status === "not-tested").length,
  };
}

function normalize(value) {
  return value.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
}

export function filterCompatibilityEntries(entries, { query = "", status = "all" } = {}) {
  const terms = normalize(query).trim().split(/\s+/).filter(Boolean);
  return entries.filter((entry) => {
    if (status !== "all" && entry.status !== status) return false;
    const text = normalize([entry.title, entry.gameId, entry.edition ?? "", entry.observation ?? ""].join(" "));
    return terms.every((term) => text.includes(term));
  }).sort((left, right) => left.title.localeCompare(right.title, "en")
    || (left.edition ?? "").localeCompare(right.edition ?? "", "en")
    || left.gameId.localeCompare(right.gameId, "en"));
}
