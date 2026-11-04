export const compatibilityStatusLabels = {
  "startup-verified": "Startup verified",
  "startup-warning": "Startup with warnings",
  "startup-failed": "Startup failed",
  "not-tested": "Not yet tested",
};

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
