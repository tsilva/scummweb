const collator = new Intl.Collator("en", { numeric: true, sensitivity: "base" });

export const defaultLibraryQuery = { sort: "name-asc", search: "", genre: "", year: "", source: "" };

export function libraryItems(catalog, library) {
  return [
    ...catalog.map((game) => ({ key: `catalog:${game.target}`, game, title: game.displayTitle, sourceType: "catalog" })),
    ...library.map((entry) => ({ ...entry, key: `source:${entry.source.id}`, sourceType: entry.source.url ? "remote" : "local" })),
  ];
}

export function libraryYear(game) {
  return /^\d{4}$/.test(String(game.year)) ? String(game.year) : "Unknown";
}

export function libraryFacet(items, field) {
  return [...new Set(items.map(({ game }) => field === "year" ? libraryYear(game) : game[field] || "Unknown"))]
    .sort((a, b) => a === "Unknown" ? 1 : b === "Unknown" ? -1 : collator.compare(a, b));
}

export function queryLibrary(items, query) {
  const search = query.search.trim().toLocaleLowerCase();
  const result = items.filter(({ title, game, sourceType }) =>
    (!search || title.toLocaleLowerCase().includes(search)) &&
    (!query.genre || (game.genre || "Unknown") === query.genre) &&
    (!query.year || libraryYear(game) === query.year) &&
    (!query.source || sourceType === query.source)
  );
  const [field, direction] = query.sort.split("-");
  const sign = direction === "desc" ? -1 : 1;
  return result.sort((a, b) => {
    if (field === "year") {
      const aYear = libraryYear(a.game);
      const bYear = libraryYear(b.game);
      if (aYear !== bYear) {
        if (aYear === "Unknown") return 1;
        if (bYear === "Unknown") return -1;
        return (Number(aYear) - Number(bYear)) * sign;
      }
    } else if (field !== "name") {
      const comparison = collator.compare(a.game[field] || "", b.game[field] || "");
      if (comparison) return comparison * sign;
    }
    return collator.compare(a.title, b.title) * (field === "name" ? sign : 1) || collator.compare(a.key, b.key);
  });
}
