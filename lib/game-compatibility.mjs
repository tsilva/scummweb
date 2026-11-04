export function getCompatibilitySummary(entries) {
  const verified = entries.filter((entry) => entry.status === "startup-verified");
  return {
    total: entries.length,
    verified: verified.length,
    verifiedGames: new Set(verified.map((entry) => entry.title)).size,
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
    const text = normalize([entry.title, entry.gameId, entry.edition ?? ""].join(" "));
    return terms.every((term) => text.includes(term));
  }).sort((left, right) => left.title.localeCompare(right.title, "en")
    || (left.edition ?? "").localeCompare(right.edition ?? "", "en")
    || left.gameId.localeCompare(right.gameId, "en"));
}
