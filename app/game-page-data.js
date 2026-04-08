import { getGameLibrary, getSourceInfo } from "./game-library";
import { getGamePresentation } from "./game-presentation";
import {
  buildGameMetadata,
  buildPlayRouteMetadata,
} from "./seo";

function shortCommit(commit) {
  return commit ? commit.slice(0, 7) : "unknown";
}

function pickFeaturedGame(catalog) {
  if (catalog.length === 0) {
    return null;
  }

  return catalog[Math.floor(Math.random() * catalog.length)];
}

export async function getGameStaticParams() {
  const { games } = await getGameLibrary();

  return games.map((game) => ({
    gameSlug: game.slug,
  }));
}

export async function getPresentedGameBySlug(gameSlug) {
  const { games } = await getGameLibrary();
  const game = games.find((entry) => entry.slug === gameSlug);

  if (!game) {
    return null;
  }

  return getGamePresentation(game);
}

export async function getPresentedGameByTarget(target) {
  const { games } = await getGameLibrary();
  const game = games.find((entry) => entry.target === target);

  if (!game) {
    return null;
  }

  return getGamePresentation(game);
}

export async function getHomeShellData(options = {}) {
  const {
    featuredGameSlug = null,
    featuredGameTarget = null,
    randomize = false,
  } = options;
  const { games } = await getGameLibrary();
  const sourceInfo = await getSourceInfo();

  if (games.length === 0) {
    throw new Error("No installed game metadata found");
  }

  const catalog = games.map(getGamePresentation);
  const featuredGame = featuredGameSlug
    ? catalog.find((game) => game.slug === featuredGameSlug) || null
    : featuredGameTarget
      ? catalog.find((game) => game.target === featuredGameTarget) || null
    : randomize
      ? pickFeaturedGame(catalog)
      : catalog[0];

  if (!featuredGame) {
    return null;
  }

  const scummvmVersion = sourceInfo.scummvm.version
    ? `${sourceInfo.scummvm.version} (${shortCommit(sourceInfo.scummvm.commit)})`
    : shortCommit(sourceInfo.scummvm.commit);

  return {
    catalog,
    featuredGame,
    sourceInfoDate: sourceInfo.generated_at_utc.slice(0, 10),
    scummvmVersion,
  };
}

export function getGameOpenGraphImageUrl(game) {
  return buildGameMetadata(game).openGraph.images[0].url;
}

export { buildGameMetadata, buildPlayRouteMetadata };
