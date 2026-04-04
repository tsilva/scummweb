import { getGameLibrary, getSourceInfo } from "./game-library";
import { getGamePresentation } from "./game-presentation";
import { getSiteUrl } from "./site-config";

function shortCommit(commit) {
  return commit ? commit.slice(0, 7) : "unknown";
}

function pickFeaturedGame(catalog) {
  if (catalog.length === 0) {
    return null;
  }

  return catalog[Math.floor(Math.random() * catalog.length)];
}

function buildAbsoluteUrl(pathname) {
  return new URL(pathname, `${getSiteUrl()}/`).toString();
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

export async function getHomeShellData(options = {}) {
  const { featuredGameSlug = null, randomize = false } = options;
  const { games } = await getGameLibrary();
  const sourceInfo = await getSourceInfo();

  if (games.length === 0) {
    throw new Error("No installed game metadata found");
  }

  const catalog = games.map(getGamePresentation);
  const featuredGame = featuredGameSlug
    ? catalog.find((game) => game.slug === featuredGameSlug) || null
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
  return buildAbsoluteUrl(`${game.href}/opengraph-image`);
}

export function buildGameMetadata(game) {
  const title = `${game.displayTitle} | scummweb`;
  const description = game.summary;
  const canonical = buildAbsoluteUrl(game.href);
  const image = getGameOpenGraphImageUrl(game);

  return {
    title,
    description,
    alternates: {
      canonical,
    },
    openGraph: {
      title,
      description,
      type: "website",
      url: canonical,
      images: [
        {
          url: image,
          width: 1200,
          height: 630,
          alt: `${game.displayTitle} on scummweb`,
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [image],
    },
  };
}

export function buildPlayRouteMetadata(game) {
  return {
    title: `Play ${game.displayTitle} | scummweb`,
    description: `Launch ${game.displayTitle} instantly in the ScummVM browser shell.`,
    alternates: {
      canonical: buildAbsoluteUrl(game.href),
    },
    robots: {
      index: false,
      follow: false,
      googleBot: {
        index: false,
        follow: false,
      },
    },
  };
}
