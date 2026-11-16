import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { artworkDelivery } from "../lib/artwork-storage.mjs";
import { getGamePresentation } from "../app/game-presentation.js";
import { getArtworkImageProps } from "../app/home-shell/artwork-image-props.mjs";
import { getHeroImageProps, getHeroPreloadImages } from "../app/home-shell/hero-images.mjs";
import { getPosterImageProps } from "../app/home-shell/poster-images.mjs";
import { homeArtworkDelivery } from "../app/home-shell/initial-artwork.mjs";

test("scoped homepage artwork preserves every hero, preload, poster and featured screenshot", () => {
  const { games, primaryTarget } = JSON.parse(fs.readFileSync(new URL("../scummvm-shell/games.json", import.meta.url)));
  const catalog = games.map(getGamePresentation);
  const featured = catalog.find((game) => game.target === primaryTarget) || catalog[0];
  const complete = artworkDelivery(catalog);
  const scoped = homeArtworkDelivery(catalog, featured);
  for (const game of catalog) {
    assert.deepEqual(getHeroImageProps(game, scoped), getHeroImageProps(game, complete), game.target);
    assert.deepEqual(getPosterImageProps(game.posterImage, false, catalog.length, scoped),
      getPosterImageProps(game.posterImage, false, catalog.length, complete), game.target);
  }
  const slides = catalog.map((game) => ({ game }));
  for (let index = 0; index < slides.length; index++) {
    assert.deepEqual(getHeroPreloadImages(slides, index, 3, scoped), getHeroPreloadImages(slides, index, 3, complete));
  }
  for (const shot of featured.screenshots || []) {
    assert.deepEqual(getArtworkImageProps(shot, "gallery", scoped), getArtworkImageProps(shot, "gallery", complete));
  }
  assert.ok(Object.keys(scoped.files).length < Object.keys(complete.files).length);
});

test("unoptimized heroes retain mobile sources and landscape or poster fallbacks", () => {
  const games = [
    { heroImage: "/hero.webp", heroImageMobile: "/mobile.webp", posterImage: "/poster.webp" },
    { landscapeImage: "/landscape.webp", posterImage: "/poster.webp" },
    { posterImage: "/poster.webp" },
  ];
  const manifest = { published: false, origin: "https://assets.example", files: Object.fromEntries(
    ["hero", "mobile", "landscape", "poster"].map((name) => [`/${name}.webp`, { key: `${name}.webp`, width: 100 }])) };
  const complete = artworkDelivery(games, manifest);
  const scoped = homeArtworkDelivery(games, games[0], manifest);
  for (const game of games) assert.deepEqual(getHeroImageProps(game, scoped), getHeroImageProps(game, complete));
  assert.ok(scoped.files["/mobile.webp"]);
});
