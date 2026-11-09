import assert from "node:assert/strict";
import test from "node:test";
import {
  addGameRoutes,
  getBundledGameLibrary,
  getGameStaticParams,
} from "../lib/catalog.mjs";
import { normalizeSkipIntroConfig } from "../app/skip-intro-config.mjs";

test("addGameRoutes generates stable unique slugs and play routes", () => {
  const games = addGameRoutes([
    { target: "queen", title: "Flight of the Amazon Queen" },
    { target: "queen-cd", title: "Flight of the Amazon Queen" },
  ]);

  assert.deepEqual(
    games.map((game) => ({
      href: game.href,
      playHref: game.playHref,
      slug: game.slug,
    })),
    [
      {
        href: "/flight-of-the-amazon-queen",
        playHref: "/flight-of-the-amazon-queen/play",
        slug: "flight-of-the-amazon-queen",
      },
      {
        href: "/flight-of-the-amazon-queen-queen-cd",
        playHref: "/flight-of-the-amazon-queen-queen-cd/play",
        slug: "flight-of-the-amazon-queen-queen-cd",
      },
    ],
  );
});

test("getBundledGameLibrary normalizes skip-intro configs and keeps primary target", () => {
  const library = getBundledGameLibrary(
    {
      primaryTarget: "sky",
      games: [
        {
          target: "sky",
          title: "Beneath a Steel Sky (CD)",
          skipIntro: {
            slot: 0,
            saveFiles: ["SKY-VM.000", "SKY-VM.000"],
          },
        },
      ],
    },
    { normalizeSkipIntro: normalizeSkipIntroConfig },
  );

  assert.equal(library.primaryTarget, "sky");
  assert.deepEqual(library.games[0].skipIntro, {
    strategy: "save-slot",
    slot: 0,
    saveFiles: ["SKY-VM.000"],
  });
  assert.deepEqual(getGameStaticParams(library.games), [{ gameSlug: "beneath-a-steel-sky" }]);
});

test("getBundledGameLibrary sorts display titles alphabetically while preserving the primary target", () => {
  const games = [
    { target: "queen", title: "Flight of the Amazon Queen" },
    { target: "sky", title: "Beneath a Steel Sky" },
    { target: "alpha", title: "alpha (CD)" },
    { target: "alpha-demo", title: "Alpha (Demo)" },
    { target: "queen-cd", title: "Flight of the Amazon Queen" },
  ];
  const library = getBundledGameLibrary({
    primaryTarget: "queen",
    games,
  });

  assert.deepEqual(library.games.map((game) => game.target), [
    "alpha", "alpha-demo", "sky", "queen", "queen-cd",
  ]);
  assert.equal(library.primaryTarget, "queen");
  assert.deepEqual(library.games.find((game) => game.target === "queen-cd"),
    addGameRoutes(games).find((game) => game.target === "queen-cd"));
  assert.equal(games[0].target, "queen");
});

test("bundled series use installment order without changing titles or routes", () => {
  const source = [
    { target: "sq6", title: "Space Quest 6: Roger Wilco in the Spinal Frontier" },
    { target: "sq2", title: "Space Quest II: Chapter II - Vohaul's Revenge" },
    { target: "sq1", title: "Space Quest: The Sarien Encounter" },
  ];
  const library = getBundledGameLibrary({ primaryTarget: "sq6", games: source });
  assert.deepEqual(library.games.map(({ target }) => target), ["sq1", "sq2", "sq6"]);
  assert.equal(library.primaryTarget, "sq6");
  for (const game of addGameRoutes(source)) {
    assert.deepEqual(library.games.find(({ target }) => target === game.target), game);
  }
});
