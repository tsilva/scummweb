import assert from "node:assert/strict";
import test from "node:test";
import library from "../scummvm-shell/games.json" with { type: "json" };
import { getBundledGameLibrary } from "../lib/catalog.mjs";
import { getRecognizedGames } from "../app/recognized-games.mjs";
import { getGameSocialCardPath } from "../lib/social-card-paths.mjs";
import {
  HOME_DESCRIPTION,
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
    const metadata = buildHomeMetadata();

    assert.equal(metadata.title, "Play Classic Adventure Games in Your Browser | ScummWEB");
    assert.equal(
      metadata.description,
      "Play free point-and-click adventures right in your browser. No installation required. Try Beneath a Steel Sky or import your own ScummVM games.",
    );
    assert.equal(metadata.openGraph.title, "Classic Adventures in Your Browser. No Installation Required.");
    assert.equal(metadata.twitter.title, metadata.openGraph.title);
    assert.equal(metadata.openGraph.description, metadata.description);
    assert.equal(metadata.twitter.description, metadata.description);
    assert.equal(metadata.alternates.canonical, "https://example.com/");
    assert.equal(metadata.openGraph.url, "https://example.com/");
    assert.equal(metadata.openGraph.siteName, SITE_NAME);
    const image = {
      url: "https://example.com/opengraph-image?v=sw-64d093a31605192c",
      alt: "ScummWEB. Play classic adventures in your browser. A retro monitor frames a glowing green doorway.",
    };
    assert.deepEqual(metadata.openGraph.images, [{ ...image, width: 1200, height: 630 }]);
    assert.deepEqual(metadata.twitter.images, [image]);
  } finally {
    if (previousSiteUrl === undefined) delete process.env.NEXT_PUBLIC_SITE_URL;
    else process.env.NEXT_PUBLIC_SITE_URL = previousSiteUrl;
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
      "Beneath a Steel Sky — Play Online | ScummWEB",
    );
    assert.equal(
      buildGameDescription(sampleGame),
      "Play free in your browser. Beneath a Steel Sky opens with a broken hovercar, a towering dystopian city, and sharp cyberpunk wit.",
    );
    assert.equal(
      metadata.alternates.canonical,
      "https://example.com/beneath-a-steel-sky",
    );
    assert.equal(
      metadata.openGraph.images[0].alt,
      "Beneath a Steel Sky artwork on ScummWEB",
    );
    assert.equal(
      metadata.openGraph.images[0].url,
      `https://example.com${getGameSocialCardPath(sampleGame)}`,
    );
    assert.deepEqual(metadata.twitter.images, [
      {
        url: `https://example.com${getGameSocialCardPath(sampleGame)}`,
        alt: "Beneath a Steel Sky artwork on ScummWEB",
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
    assert.deepEqual(playMetadata.openGraph, metadata.openGraph);
    assert.deepEqual(playMetadata.twitter, metadata.twitter);
    assert.equal(playMetadata.description, metadata.description);
  } finally {
    if (previousSiteUrl === undefined) delete process.env.NEXT_PUBLIC_SITE_URL;
    else process.env.NEXT_PUBLIC_SITE_URL = previousSiteUrl;
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
    assert.equal(gameStructuredData.publisher, undefined);
    assert.equal(gameStructuredData.creator, undefined);
    const credited = buildGameStructuredData({ ...sampleGame, developer: "Verified Developer", publisher: "Verified Publisher" });
    assert.equal(credited.creator.name, "Verified Developer");
    assert.equal(credited.publisher.name, "Verified Publisher");
  } finally {
    if (previousSiteUrl === undefined) delete process.env.NEXT_PUBLIC_SITE_URL;
    else process.env.NEXT_PUBLIC_SITE_URL = previousSiteUrl;
  }
});

test("catalog metadata is concise, unique, edition-specific and clear about imports", () => {
  const games = getRecognizedGames(getBundledGameLibrary(library).games);
  const titles = new Set();
  const descriptions = new Set();
  for (const game of games) {
    const metadata = buildGameMetadata(game);
    assert.ok(metadata.title.length <= 65, `${game.slug}: ${metadata.title}`);
    assert.ok(metadata.description.length <= 160, `${game.slug}: ${metadata.description}`);
    assert.ok(!titles.has(metadata.title), `Duplicate title: ${metadata.title}`);
    assert.ok(!descriptions.has(metadata.description), `Duplicate description: ${metadata.description}`);
    titles.add(metadata.title);
    descriptions.add(metadata.description);
    if (game.importRequired) {
      assert.match(metadata.title, /Import & Play/);
      assert.match(metadata.description, /^Import your copy to play online\./);
      assert.equal(buildGameStructuredData(game).isAccessibleForFree, undefined);
    }
    if (game.editionLabel) {
      assert.ok(metadata.title.includes(`(${game.editionLabel})`), game.slug);
      assert.ok(buildGameStructuredData(game).name.endsWith(`(${game.editionLabel})`), game.slug);
    }
    if (/\(Demo\)$/.test(game.displayTitle)) assert.match(metadata.title, /\(Demo\)/);
    assert.equal(metadata.openGraph.title, metadata.title);
    assert.equal(metadata.twitter.description, metadata.description);
  }
});

test("long descriptions shorten at word boundaries while retaining access requirements", () => {
  const game = { ...sampleGame, importRequired: true, summary: "An elaborate adventure through unfamiliar lands and ancient ruins. ".repeat(8) };
  const description = buildGameDescription(game);
  assert.ok(description.length <= 160);
  assert.match(description, /^Import your copy to play online\./);
  assert.ok(description.endsWith("…"));
  const excerpt = description.replace(/^Import your copy to play online\. /, "").slice(0, -1);
  assert.ok(`${game.summary} `.includes(`${excerpt} `), "Excerpt must end on a complete word");
});
