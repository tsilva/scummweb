import { compareGameTitles } from "../../lib/game-title-sort.mjs";
import { isDemoGame } from "../game-versions.mjs";

const collator = new Intl.Collator("en", { numeric: true, sensitivity: "base" });
const featuredTargets = ["sky", "queen", "lure", "dreamweb-cd", "sword25"];

export const defaultLibraryQuery = { sort: "featured", genre: "" };

export const libraryCategories = [
  "Action & arcade", "Adventure", "Animation", "Cards & board games", "Comedy",
  "Family & education", "Fantasy", "Horror", "Mystery & thriller", "Puzzle",
  "Role-playing", "Science fiction", "Simulation", "Sports",
];

const normalizeGenre = (value) => (value || "").trim().replace(/\s+/g, " ").toLocaleLowerCase("en");
const categoriesByName = new Map(libraryCategories.map((category) => [normalizeGenre(category), category]));

function featuredRank(game) {
  if (isDemoGame(game)) return featuredTargets.length + 2;
  if (game.target === "hires1") return featuredTargets.length + 1;
  const index = featuredTargets.indexOf(game.target);
  return index >= 0 ? index : featuredTargets.length;
}

export function libraryYear(game) {
  return /^\d{4}$/.test(String(game.year)) ? String(game.year) : "Unknown";
}

// Fallback for older saved imports without an explicit catalog category.
// Earlier groups take precedence for hybrid genres.
const genreGroups = [
  ["Family & education", /children|storybook|educat(?:ion|ional)|environmental|\bfamily\b|preschool|junior adventure|interactive field trip|activity collection|creative activities|interactive poetry/],
  ["Role-playing", /role[ -]playing|\brpg\b|dungeon[ -]crawling/],
  ["Action & arcade", /\baction\b|\barcade\b/],
  ["Simulation", /simulation/],
  ["Cards & board games", /card games|board games?|casino|solitaire/],
  ["Sports", /\bsports?\b|baseball|basketball|american football/],
  ["Animation", /holiday animation/],
  ["Horror", /horror/],
  ["Science fiction", /science[ -]fiction|sci[ -]fi|cyberpunk|time[ -]travel|space adventure/],
  ["Fantasy", /fantasy|arthurian/],
  ["Mystery & thriller", /mystery|thriller|detective|police|conspiracy|noir|espionage/],
  ["Comedy", /comedy|comic|caper/],
  ["Puzzle", /puzzle/],
];

export function libraryGenre(game) {
  const category = categoriesByName.get(normalizeGenre(game.category));
  if (category) return category;
  const genre = normalizeGenre(game.genre);
  if (!genre || genre === "unknown") return "Unknown";
  if (categoriesByName.has(genre)) return categoriesByName.get(genre);
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
