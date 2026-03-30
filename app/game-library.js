import fs from "node:fs/promises";
import path from "node:path";

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
  const normalizedPath = assetPath.startsWith("/") ? assetPath : `/${assetPath}`;
  return `/scummvm/${encodeURIComponent(scummvmAssetVersion)}${normalizedPath}`;
}

export async function getGameLibrary() {
  const publicDir = path.join(process.cwd(), "public");
  const libraryPath = path.join(publicDir, "games.json");

  try {
    const library = JSON.parse(await fs.readFile(libraryPath, "utf8"));
    const games = Array.isArray(library.games) ? library.games : [];

    return {
      games: addGameRoutes(games),
      primaryTarget: library.primaryTarget || games[0]?.target || "",
    };
  } catch {
    const primaryGame = JSON.parse(await fs.readFile(path.join(publicDir, "game.json"), "utf8"));

    return {
      games: addGameRoutes([primaryGame]),
      primaryTarget: primaryGame.target,
    };
  }
}

export async function getGameBySlug(gameSlug) {
  const { games } = await getGameLibrary();
  return games.find((game) => game.slug === gameSlug) || null;
}
