import { getSiteUrl } from "./site-config.mjs";
import { getGameSocialCardPath } from "./social-card-paths.mjs";

export const APP_THEME_COLOR = "#1a4d1a";
export const SITE_NAME = "ScummWEB";
export const SITE_DISPLAY_NAME = "ScummWEB";
export const HOME_TITLE = "Play Classic Adventure Games in Your Browser | ScummWEB";
const HOME_SOCIAL_TITLE = "Classic Adventures in Your Browser. No Installation Required.";
export const HOME_DESCRIPTION =
  "Play free point-and-click adventures right in your browser. No installation required. Try Beneath a Steel Sky or import your own ScummVM games.";
export const HOME_HERO_KICKER = "No Installation Required";
export const HOME_HERO_TITLE = "Play classic adventure games in your browser";
export const HOME_HERO_SUMMARY =
  "Play Beneath a Steel Sky and other free adventures, or drop a ZIP or ISO of your own ScummVM-compatible game anywhere on this page.";
export const HOME_BROWSE_LABEL = "Browse Games";

function normalizeDescription(value) {
  return value.replace(/\s+/g, " ").trim();
}

function conciseDescription(value, limit) {
  const text = normalizeDescription(value);
  if (text.length <= limit) return text;
  const excerpt = text.slice(0, limit - 1);
  const boundary = excerpt.lastIndexOf(" ");
  return `${excerpt.slice(0, boundary > 0 ? boundary : undefined).replace(/[\s,;:.!?-]+$/, "")}…`;
}

function getGameMetadataTitle(game) {
  const name = game.shortTitle || game.displayTitle;
  const edition = game.editionLabel ? ` (${game.editionLabel})` : "";
  const action = game.importRequired ? "Import & Play" : "Play Online";
  const title = `${name}${edition} — ${action}`;
  const branded = `${title} | ${SITE_NAME}`;
  // An editorial space budget, not a search-engine character limit.
  return branded.length <= 65 ? branded : title;
}

function extractYear(value) {
  const match = String(value || "").match(/\b(19|20)\d{2}\b/);
  return match ? match[0] : null;
}

export function buildAbsoluteUrl(pathname) {
  return new URL(pathname, `${getSiteUrl()}/`).toString();
}

export function getHomeOpenGraphImageUrl() {
  return buildAbsoluteUrl("/opengraph-image?v=sw-64d093a31605192c");
}

export function getGameOpenGraphImageUrl(game) {
  return buildAbsoluteUrl(getGameSocialCardPath(game));
}

export function buildGameDescription(game) {
  const access = game.importRequired ? "Import your copy to play online. " : "Play free in your browser. ";
  return access + conciseDescription(game.mobileSummary || game.summary || game.displayTitle, 160 - access.length);
}

export function buildHomeMetadata() {
  const canonical = buildAbsoluteUrl("/");
  const image = getHomeOpenGraphImageUrl();
  const imageAlt = "ScummWEB. Play classic adventures in your browser. A retro monitor frames a glowing green doorway.";

  return {
    title: HOME_TITLE,
    description: HOME_DESCRIPTION,
    alternates: {
      canonical,
    },
    openGraph: {
      title: HOME_SOCIAL_TITLE,
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
      title: HOME_SOCIAL_TITLE,
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
  const title = getGameMetadataTitle(game);
  const description = buildGameDescription(game);
  const canonical = buildAbsoluteUrl(game.href);
  const image = getGameOpenGraphImageUrl(game);
  const imageAlt = `${game.displayTitle}${game.editionLabel ? ` (${game.editionLabel})` : ""} artwork on ${SITE_NAME}`;

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
    ...buildGameMetadata(game),
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
    name: `${game.displayTitle}${game.editionLabel ? ` (${game.editionLabel})` : ""}`,
    url: buildAbsoluteUrl(game.href),
    description: buildGameDescription(game),
    image: absoluteImage,
    genre: game.genre,
    // Display studio credits can refer to different roles; never infer them here.
    creator: game.developer ? {
      "@type": "Organization",
      name: game.developer,
    } : undefined,
    publisher: game.publisher ? {
      "@type": "Organization",
      name: game.publisher,
    } : undefined,
    datePublished: year || undefined,
    isAccessibleForFree: game.importRequired ? undefined : true,
    playMode: "SinglePlayer",
  };
}
