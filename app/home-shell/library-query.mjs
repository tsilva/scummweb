import { compareGameTitles } from "../../lib/game-title-sort.mjs";
import { isDemoGame } from "../game-versions.mjs";

const collator = new Intl.Collator("en", { numeric: true, sensitivity: "base" });
const featuredTargets = ["sky", "queen", "lure", "dreamweb-cd", "sword25"];

export const defaultLibraryQuery = { sort: "featured", genre: "" };

function featuredRank(game) {
  if (isDemoGame(game)) return featuredTargets.length + 2;
  if (game.target === "hires1") return featuredTargets.length + 1;
  const index = featuredTargets.indexOf(game.target);
  return index >= 0 ? index : featuredTargets.length;
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
    if (field === "featured") {
      const rank = featuredRank(a.game) - featuredRank(b.game);
      if (rank) return rank;
    } else if (field === "year") {
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
    return compareGameTitles(a.title, b.title) * (field === "name" ? sign : 1) || collator.compare(a.key, b.key);
  });
}
