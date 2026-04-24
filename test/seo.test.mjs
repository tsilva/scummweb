import assert from "node:assert/strict";
import test from "node:test";
import {
  HOME_DESCRIPTION,
  HOME_TITLE,
  SITE_NAME,
  buildGameDescription,
  buildGameMetadata,
  buildGameStructuredData,
  buildHomeMetadata,
  buildHomeStructuredData,
  buildPlayRouteMetadata,
} from "../lib/seo.mjs";

const sampleGame = {
  displayTitle: "Beneath a Steel Sky",
  href: "/beneath-a-steel-sky",
  summary:
    "Beneath a Steel Sky opens with a broken hovercar, a towering dystopian city, and sharp cyberpunk wit.",
  year: "1994",
  genre: "Cyberpunk Adventure",
  studio: "Revolution Software",
  spotlightImage: "/launcher/sky-cover.webp",
};

test("homepage metadata uses ScummWEB branding and aligned social copy", () => {
  const previousSiteUrl = process.env.NEXT_PUBLIC_SITE_URL;
  process.env.NEXT_PUBLIC_SITE_URL = "https://example.com";

  try {
    const metadata = buildHomeMetadata(sampleGame);

    assert.equal(HOME_TITLE, "Play classic adventure games in your browser | ScummWEB");
    assert.equal(
      HOME_DESCRIPTION,
      "Play Beneath a Steel Sky and more classic point-and-click adventures in your browser with ScummWEB.",
    );
    assert.equal(metadata.alternates.canonical, "https://example.com/");
    assert.equal(metadata.openGraph.url, "https://example.com/");
    assert.equal(metadata.openGraph.siteName, SITE_NAME);
    assert.equal(
      metadata.openGraph.images[0].alt,
      "Beneath a Steel Sky and other classic adventure games playable online on ScummWEB",
    );
    assert.deepEqual(metadata.twitter.images, [
      {
        url: "https://example.com/opengraph-image",
        alt: "Beneath a Steel Sky and other classic adventure games playable online on ScummWEB",
      },
    ]);
  } finally {
    process.env.NEXT_PUBLIC_SITE_URL = previousSiteUrl;
  }
});

test("game metadata and play-route metadata keep canonicals aligned and play routes noindex", () => {
  const previousSiteUrl = process.env.NEXT_PUBLIC_SITE_URL;
  process.env.NEXT_PUBLIC_SITE_URL = "https://example.com";

  try {
    const metadata = buildGameMetadata(sampleGame);
    const playMetadata = buildPlayRouteMetadata(sampleGame);

    assert.equal(
      metadata.title,
      "Play Beneath a Steel Sky in your browser | ScummWEB",
    );
    assert.equal(
      buildGameDescription(sampleGame),
      "Play Beneath a Steel Sky in your browser on ScummWEB. Beneath a Steel Sky opens with a broken hovercar, a towering dystopian city, and sharp cyberpunk wit.",
    );
    assert.equal(
      metadata.alternates.canonical,
      "https://example.com/beneath-a-steel-sky",
    );
    assert.equal(
      metadata.openGraph.images[0].alt,
      "Beneath a Steel Sky Open Graph card for browser play on ScummWEB",
    );
    assert.equal(
      metadata.openGraph.images[0].url,
      "https://example.com/beneath-a-steel-sky/social-card.png?v=dev",
    );
    assert.deepEqual(metadata.twitter.images, [
      {
        url: "https://example.com/beneath-a-steel-sky/social-card.png?v=dev",
        alt: "Beneath a Steel Sky Open Graph card for browser play on ScummWEB",
      },
    ]);
    assert.deepEqual(playMetadata.robots, {
      index: false,
      follow: false,
      googleBot: {
        index: false,
        follow: false,
      },
    });
    assert.equal(
      playMetadata.alternates.canonical,
      "https://example.com/beneath-a-steel-sky",
    );
  } finally {
    process.env.NEXT_PUBLIC_SITE_URL = previousSiteUrl;
  }
});

test("structured data matches the new brand and metadata copy", () => {
  const previousSiteUrl = process.env.NEXT_PUBLIC_SITE_URL;
  process.env.NEXT_PUBLIC_SITE_URL = "https://example.com";

  try {
    const homeStructuredData = buildHomeStructuredData([sampleGame]);
    const gameStructuredData = buildGameStructuredData(sampleGame);

    assert.equal(homeStructuredData[0].name, "ScummWEB");
    assert.equal(homeStructuredData[0].description, HOME_DESCRIPTION);
    assert.equal(
      homeStructuredData[2].name,
      "Classic adventure games playable online on ScummWEB",
    );
    assert.equal(gameStructuredData.description, buildGameDescription(sampleGame));
    assert.equal(gameStructuredData.image, "https://example.com/launcher/sky-cover.webp");
    assert.equal(gameStructuredData.publisher.name, "Revolution Software");
  } finally {
    process.env.NEXT_PUBLIC_SITE_URL = previousSiteUrl;
  }
});
