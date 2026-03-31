import primaryGameData from "../public/game.json";
import gameLibraryData from "../public/games.json";
import sourceInfoData from "../public/source-info.json";

export const scummvmAssetVersion = process.env.NEXT_PUBLIC_SCUMMVM_ASSET_VERSION || "dev";

export function getDisplayTitle(title) {
  return title.replace(/\s+\([^)]*\)$/, "");
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
      displayTitle: getDisplayTitle(game.title),
      slug,
      href: `/${slug}`,
    };
  });
}

export function getVersionedScummvmAssetPath(assetPath) {
  return getVersionedSiteAssetPath(assetPath);
}

function appendAssetVersion(url) {
  url.searchParams.delete("v");
  url.searchParams.append("v", scummvmAssetVersion);
  return url;
}

export function buildVersionedSiteAssetPath(assetPath, options = {}) {
  if (!assetPath || !assetPath.startsWith("/")) {
    return assetPath;
  }

  const resolved = new URL(assetPath, "https://scummvm-web.local");
  const searchParams = options.searchParams || {};

  for (const [key, value] of Object.entries(searchParams)) {
    if (value == null) {
      continue;
    }

    resolved.searchParams.delete(key);
    resolved.searchParams.append(key, String(value));
  }

  if (options.hash) {
    resolved.hash = options.hash;
  }

  appendAssetVersion(resolved);
  return `${resolved.pathname}${resolved.search}${resolved.hash}`;
}

export function getVersionedSiteAssetPath(assetPath) {
  return buildVersionedSiteAssetPath(assetPath);
}

function getBundledGameLibrary() {
  const games = Array.isArray(gameLibraryData?.games) ? gameLibraryData.games : [];

  if (games.length > 0) {
    return {
      games,
      primaryTarget: gameLibraryData.primaryTarget || games[0]?.target || "",
    };
  }

  return {
    games: primaryGameData ? [primaryGameData] : [],
    primaryTarget: primaryGameData?.target || "",
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
