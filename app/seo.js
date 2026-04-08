import { getSiteUrl } from "./site-config";

export const APP_THEME_COLOR = "#1a4d1a";
export const SITE_NAME = "scummweb";
export const SITE_DISPLAY_NAME = "ScummWEB";
export const HOME_FEATURED_GAME_TARGET = "sky";
export const HOME_TITLE = "Play classic freeware adventure games in your browser | scummweb";
export const HOME_DESCRIPTION =
  "Play Beneath a Steel Sky and other classic freeware point-and-click adventures directly in your browser with scummweb.";
export const HOME_HERO_KICKER = "Classic Freeware Adventures";
export const HOME_HERO_TITLE = "Play classic point-and-click adventures directly in your browser";
export const HOME_HERO_SUMMARY =
  "Launch Beneath a Steel Sky and more freeware adventure classics instantly with scummweb, a browser-first ScummVM collection for quick play.";
export const HOME_BROWSE_LABEL = "Browse classics";

function normalizeDescription(value) {
  return value.replace(/\s+/g, " ").trim();
}

function extractYear(value) {
  const match = String(value || "").match(/\b(19|20)\d{2}\b/);
  return match ? match[0] : null;
}

export function buildAbsoluteUrl(pathname) {
  return new URL(pathname, `${getSiteUrl()}/`).toString();
}

export function getHomeOpenGraphImageUrl() {
  return buildAbsoluteUrl("/opengraph-image");
}

export function getGameOpenGraphImageUrl(game) {
  return buildAbsoluteUrl(`${game.href}/opengraph-image`);
}

export function buildGameDescription(game) {
  return normalizeDescription(
    `Play ${game.displayTitle} directly in your browser with scummweb. ${game.summary}`
  );
}

export function buildHomeMetadata(featuredGame) {
  const canonical = buildAbsoluteUrl("/");
  const image = getHomeOpenGraphImageUrl();
  const featuredTitle = featuredGame?.displayTitle || "Beneath a Steel Sky";

  return {
    title: HOME_TITLE,
    description: HOME_DESCRIPTION,
    alternates: {
      canonical,
    },
    openGraph: {
      title: HOME_TITLE,
      description: HOME_DESCRIPTION,
      type: "website",
      url: canonical,
      images: [
        {
          url: image,
          width: 1200,
          height: 630,
          alt: `${featuredTitle} featured on scummweb`,
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title: HOME_TITLE,
      description: HOME_DESCRIPTION,
      images: [image],
    },
  };
}

export function buildGameMetadata(game) {
  const title = `Play ${game.displayTitle} in your browser | scummweb`;
  const description = buildGameDescription(game);
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
          alt: `${game.displayTitle} playable in the browser on scummweb`,
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
    title: `Play ${game.displayTitle} in your browser | scummweb`,
    description: `Launch ${game.displayTitle} instantly in the scummweb browser player.`,
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

export function buildHomeStructuredData(games) {
  const homeUrl = buildAbsoluteUrl("/");
  const websiteId = `${homeUrl}#website`;
  const collectionId = `${homeUrl}#collection`;
  const itemListId = `${homeUrl}#games`;

  return [
    {
      "@context": "https://schema.org",
      "@type": "WebSite",
      "@id": websiteId,
      name: SITE_NAME,
      alternateName: SITE_DISPLAY_NAME,
      url: homeUrl,
      description: HOME_DESCRIPTION,
      inLanguage: "en",
    },
    {
      "@context": "https://schema.org",
      "@type": "CollectionPage",
      "@id": collectionId,
      url: homeUrl,
      name: HOME_HERO_TITLE,
      description: HOME_DESCRIPTION,
      isPartOf: {
        "@id": websiteId,
      },
      mainEntity: {
        "@id": itemListId,
      },
    },
    {
      "@context": "https://schema.org",
      "@type": "ItemList",
      "@id": itemListId,
      url: homeUrl,
      name: "Browser-playable freeware adventure classics",
      numberOfItems: games.length,
      itemListElement: games.map((game, index) => ({
        "@type": "ListItem",
        position: index + 1,
        name: game.displayTitle,
        url: buildAbsoluteUrl(game.href),
      })),
    },
  ];
}

export function buildGameStructuredData(game) {
  const year = extractYear(game.year);
  const absoluteImage = game.spotlightImage
    ? buildAbsoluteUrl(game.spotlightImage)
    : game.posterImage
      ? buildAbsoluteUrl(game.posterImage)
      : game.heroImage
        ? buildAbsoluteUrl(game.heroImage)
        : undefined;

  return {
    "@context": "https://schema.org",
    "@type": "VideoGame",
    name: game.displayTitle,
    url: buildAbsoluteUrl(game.href),
    description: buildGameDescription(game),
    image: absoluteImage,
    genre: game.genre,
    publisher: {
      "@type": "Organization",
      name: game.studio,
    },
    datePublished: year || undefined,
    isAccessibleForFree: true,
    playMode: "SinglePlayer",
  };
}
