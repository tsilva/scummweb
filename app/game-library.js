import gameLibraryData from "../public/games.json";
import sourceInfoData from "../public/source-info.json";
export {
  buildVersionedAssetPath as buildVersionedSiteAssetPath,
  getVersionedScummvmAssetPath,
  getVersionedSiteAssetPath,
  scummvmAssetVersion,
} from "./asset-paths";

export function getDisplayTitle(title) {
  return title.replace(/\s+\([^)]*\)$/, "");
}

function normalizeSkipIntroConfig(skipIntro) {
  if (!skipIntro || typeof skipIntro !== "object") {
    return null;
  }

  const durationMinutes = Number(skipIntro.durationMinutes);

  if (!Number.isFinite(durationMinutes) || durationMinutes <= 0) {
    return null;
  }

  const key =
    typeof skipIntro.key === "string" && skipIntro.key.trim() ? skipIntro.key.trim() : "Escape";
  const parsedPressCount = Number(skipIntro.pressCount);
  const pressCount =
    Number.isFinite(parsedPressCount) && parsedPressCount > 0 ? Math.floor(parsedPressCount) : 1;
  const parsedPressIntervalMs = Number(skipIntro.pressIntervalMs);
  const pressIntervalMs =
    Number.isFinite(parsedPressIntervalMs) && parsedPressIntervalMs >= 0
      ? parsedPressIntervalMs
      : 0;

  return {
    durationMinutes,
    key,
    pressCount,
    pressIntervalMs,
  };
}

function slugifySegment(value) {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
}

function getUniqueGameSlug(game, usedSlugs) {
  const baseSlug = slugifySegment(getDisplayTitle(game.title || ""));
  const targetSlug = slugifySegment(game.target || "game") || "game";
  const preferredSlug = baseSlug || targetSlug;

  if (!usedSlugs.has(preferredSlug)) {
    usedSlugs.add(preferredSlug);
    return preferredSlug;
  }

  const fallbackBase = `${preferredSlug}-${targetSlug}`.replace(/-{2,}/g, "-");
  let suffix = 2;
  let candidate = fallbackBase;

  while (usedSlugs.has(candidate)) {
    candidate = `${fallbackBase}-${suffix}`;
    suffix += 1;
  }

  usedSlugs.add(candidate);
  return candidate;
}

function addGameRoutes(games) {
  const usedSlugs = new Set();

  return games.map((game) => {
    const slug = getUniqueGameSlug(game, usedSlugs);

    return {
      ...game,
      skipIntro: normalizeSkipIntroConfig(game.skipIntro),
      displayTitle: getDisplayTitle(game.title),
      slug,
      href: `/${slug}`,
    };
  });
}

function getBundledGameLibrary() {
  const games = Array.isArray(gameLibraryData?.games) ? gameLibraryData.games : [];

  if (games.length === 0) {
    throw new Error("No installed game metadata found in public/games.json");
  }

  return {
    games,
    primaryTarget: gameLibraryData.primaryTarget || games[0]?.target || "",
  };
}

export async function getGameLibrary() {
  const library = getBundledGameLibrary();

  return {
    games: addGameRoutes(library.games),
    primaryTarget: library.primaryTarget,
  };
}

export async function getGameBySlug(gameSlug) {
  const { games } = await getGameLibrary();
  return games.find((game) => game.slug === gameSlug) || null;
}

export async function getSourceInfo() {
  return sourceInfoData;
}
