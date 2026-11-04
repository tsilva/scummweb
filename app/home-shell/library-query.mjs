const collator = new Intl.Collator("en", { numeric: true, sensitivity: "base" });

export const defaultLibraryQuery = { sort: "name-asc", genre: "" };

export function libraryItems(catalog, library) {
  return [
    ...catalog.map((game) => ({ key: `catalog:${game.target}`, game, title: game.displayTitle })),
    ...library.map((entry) => ({ ...entry, key: `source:${entry.source.id}` })),
  ];
}

export function libraryYear(game) {
  return /^\d{4}$/.test(String(game.year)) ? String(game.year) : "Unknown";
}

export function libraryGenre(game) {
  const genre = (game.genre || "").trim().replace(/\s+/g, " ").toLocaleLowerCase("en");
  const aliases = {
    "comic adventure": "comedy adventure",
    "horror comedy adventure": "comedy horror adventure",
    "children's storybook adventure": "interactive storybook",
  };
  const category = Object.hasOwn(aliases, genre) ? aliases[genre] : genre;
  if (!category) return "Unknown";
  if (category === "scummvm adventure") return "ScummVM adventure";
  return category[0].toLocaleUpperCase("en") + category.slice(1);
}

export function libraryFacet(items, field) {
  return [...new Set(items.map(({ game }) => field === "year" ? libraryYear(game)
    : field === "genre" ? libraryGenre(game) : game[field] || "Unknown"))]
    .sort((a, b) => a === "Unknown" ? 1 : b === "Unknown" ? -1 : collator.compare(a, b));
}

export function queryLibrary(items, query) {
  const genre = query.genre ? libraryGenre({ genre: query.genre }) : "";
  const result = items.filter(({ game }) => !genre || libraryGenre(game) === genre);
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
      const comparison = collator.compare(
        field === "genre" ? libraryGenre(a.game) : a.game[field] || "",
        field === "genre" ? libraryGenre(b.game) : b.game[field] || "",
      );
      if (comparison) return comparison * sign;
    }
    return collator.compare(a.title, b.title) * (field === "name" ? sign : 1) || collator.compare(a.key, b.key);
  });
}
