import { getGameFamilyKey, groupGameVersions } from "../game-versions.mjs";
import { findBundledGame } from "../bundled-game-matching.mjs";

const collator = new Intl.Collator("en", { numeric: true, sensitivity: "base" });

export const defaultLibraryQuery = { sort: "name-asc", genre: "" };

export function libraryItems(catalog, library) {
  const includedFamilies = new Set(catalog.filter((game) => !game.importRequired)
    .map(getGameFamilyKey).filter(Boolean));
  return groupGameVersions([
    ...catalog.map((game) => ({ key: `catalog:${game.target}`, game, title: game.displayTitle })),
    ...library.filter((entry) => {
      const archiveFiles = entry.archiveFiles ?? entry.source.archiveFiles;
      if (findBundledGame({ ...entry.source, archiveFiles }, catalog)) return false;
      // Legacy imports without readable data default to the included copy.
      // Retain their source and saves; reimporting verifies distinct editions.
      return Boolean(archiveFiles?.length) || !includedFamilies.has(getGameFamilyKey(entry.game));
    })
      .map((entry) => ({ ...entry, key: `source:${entry.source.id}` })),
  ]);
}

export function libraryYear(game) {
  return /^\d{4}$/.test(String(game.year)) ? String(game.year) : "Unknown";
}

// Earlier groups take precedence for hybrids: educational time travel stays
// family-friendly, horror RPGs stay role-playing, and sci-fi comedy stays sci-fi.
const genreGroups = [
  ["Family & education", /children|storybook|educat(?:ion|ional)|environmental|\bfamily\b/],
  ["Role-playing", /role[ -]playing|\brpg\b|dungeon[ -]crawling/],
  ["Action & arcade", /\baction\b|\barcade\b/],
  ["Simulation", /simulation|board game/],
  ["Horror", /horror/],
  ["Science fiction", /science[ -]fiction|sci[ -]fi|cyberpunk|time[ -]travel/],
  ["Fantasy", /fantasy|arthurian/],
  ["Mystery & thriller", /mystery|thriller|detective|police|conspiracy|noir|espionage/],
  ["Comedy", /comedy|comic|caper/],
  ["Puzzle", /puzzle/],
];

export function libraryGenre(game) {
  const genre = (game.genre || "").trim().replace(/\s+/g, " ").toLocaleLowerCase("en");
  if (!genre || genre === "unknown") return "Unknown";
  return genreGroups.find(([, pattern]) => pattern.test(genre))?.[0] ?? "Adventure";
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
