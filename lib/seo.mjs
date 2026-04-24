import { getSiteUrl } from "./site-config.mjs";

export const APP_THEME_COLOR = "#1a4d1a";
export const SITE_NAME = "ScummWEB";
export const SITE_DISPLAY_NAME = "ScummWEB";
export const HOME_FEATURED_GAME_TARGET = "sky";
export const HOME_TITLE = "Play classic adventure games in your browser | ScummWEB";
export const HOME_DESCRIPTION =
  "Play Beneath a Steel Sky and more classic point-and-click adventures in your browser with ScummWEB.";
export const HOME_HERO_KICKER = "Classic Games Online";
export const HOME_HERO_TITLE = "Play classic adventure games in your browser";
export const HOME_HERO_SUMMARY =
  "Jump into Beneath a Steel Sky and other freeware adventure classics instantly with ScummWEB, a browser-first ScummVM collection built for quick play.";
export const HOME_BROWSE_LABEL = "Browse Games";

function normalizeDescription(value) {
  return value.replace(/\s+/g, " ").trim();
}

function extractYear(value) {
  const match = String(value || "").match(/\b(19|20)\d{2}\b/);
  return match ? match[0] : null;
}

function sanitizeSocialCardVersion(rawVersion) {
  return String(rawVersion || "").replace(/[^a-zA-Z0-9._-]+/g, "-");
}

function getSocialCardVersion(env = process.env) {
  return sanitizeSocialCardVersion(
    env.NEXT_PUBLIC_SCUMMVM_ASSET_VERSION ||
      env.SCUMMVM_ASSET_VERSION ||
      env.VERCEL_DEPLOYMENT_ID ||
      env.VERCEL_URL ||
      env.VERCEL_GIT_COMMIT_SHA ||
      "dev"
  );
}

export function buildAbsoluteUrl(pathname) {
  return new URL(pathname, `${getSiteUrl()}/`).toString();
}

export function getHomeOpenGraphImageUrl() {
  return buildAbsoluteUrl("/opengraph-image");
}

export function getGameOpenGraphImageUrl(game) {
  return buildAbsoluteUrl(`${game.href}/social-card.png?v=${getSocialCardVersion()}`);
}

export function buildGameDescription(game) {
  return normalizeDescription(
    `Play ${game.displayTitle} in your browser on ${SITE_NAME}. ${game.summary}`
  );
}

export function buildHomeMetadata(featuredGame) {
  const canonical = buildAbsoluteUrl("/");
  const image = getHomeOpenGraphImageUrl();
  const featuredTitle = featuredGame?.displayTitle || "Beneath a Steel Sky";
  const imageAlt = `${featuredTitle} and other classic adventure games playable online on ${SITE_NAME}`;

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
      siteName: SITE_NAME,
      images: [
        {
          url: image,
          width: 1200,
          height: 630,
          alt: imageAlt,
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title: HOME_TITLE,
      description: HOME_DESCRIPTION,
      images: [
        {
          url: image,
          alt: imageAlt,
        },
      ],
    },
  };
}

export function buildGameMetadata(game) {
  const title = `Play ${game.displayTitle} in your browser | ${SITE_NAME}`;
  const description = buildGameDescription(game);
  const canonical = buildAbsoluteUrl(game.href);
  const image = getGameOpenGraphImageUrl(game);
  const imageAlt = `${game.displayTitle} Open Graph card for browser play on ${SITE_NAME}`;

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
      siteName: SITE_NAME,
      images: [
        {
          url: image,
          width: 1200,
          height: 630,
          alt: imageAlt,
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [
        {
          url: image,
          alt: imageAlt,
        },
      ],
    },
  };
}

export function buildPlayRouteMetadata(game) {
  return {
    title: `Play ${game.displayTitle} in your browser | ${SITE_NAME}`,
    description: `Launch ${game.displayTitle} online now in the ${SITE_NAME} browser player.`,
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
      name: `Classic adventure games playable online on ${SITE_NAME}`,
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
