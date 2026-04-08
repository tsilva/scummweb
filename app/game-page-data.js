import {
  findGameBySlug,
  findGameByTarget,
  getGameStaticParams as buildStaticParams,
  getScummvmVersionLabel,
  getSourceInfoDate,
} from "../lib/catalog.mjs";
import { getGameLibrary, getSourceInfo } from "./game-library";
import { getGamePresentation } from "./game-presentation";
import {
  buildGameMetadata,
  buildPlayRouteMetadata,
} from "./seo";

function pickFeaturedGame(catalog) {
  if (catalog.length === 0) {
    return null;
  }

  return catalog[Math.floor(Math.random() * catalog.length)];
}

export function getGameStaticParams() {
  const { games } = getGameLibrary();
  return buildStaticParams(games);
}

export function getPresentedGameBySlug(gameSlug) {
  const { games } = getGameLibrary();
  const game = findGameBySlug(games, gameSlug);

  if (!game) {
    return null;
  }

  return getGamePresentation(game);
}

export function getPresentedGameByTarget(target) {
  const { games } = getGameLibrary();
  const game = findGameByTarget(games, target);

  if (!game) {
    return null;
  }

  return getGamePresentation(game);
}

export function getHomeShellData(options = {}) {
  const {
    featuredGameSlug = null,
    featuredGameTarget = null,
    randomize = false,
  } = options;
  const { games } = getGameLibrary();
  const sourceInfo = getSourceInfo();

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

  return {
    catalog,
    featuredGame,
    sourceInfoDate: getSourceInfoDate(sourceInfo),
    scummvmVersion: getScummvmVersionLabel(sourceInfo),
  };
}

export function getGameOpenGraphImageUrl(game) {
  return buildGameMetadata(game).openGraph.images[0].url;
}

export { buildGameMetadata, buildPlayRouteMetadata };
