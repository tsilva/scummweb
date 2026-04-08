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
            durationMinutes: 2,
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
    durationMinutes: 2,
    slot: 0,
    saveFiles: ["SKY-VM.000"],
  });
  assert.deepEqual(getGameStaticParams(library.games), [{ gameSlug: "beneath-a-steel-sky" }]);
});
