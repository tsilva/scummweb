import assert from "node:assert/strict";
import test from "node:test";
import library from "../scummvm-shell/games.json" with { type: "json" };
import { getBundledGameLibrary } from "../lib/catalog.mjs";
import { getRecognizedGames } from "../app/recognized-games.mjs";
import { getRecognizedGamePresentations } from "../app/game-presentation.js";
import { getGameFamilyKey } from "../app/game-versions.mjs";
import { buildGameMetadata, buildGameStructuredData } from "../lib/seo.mjs";

const bundled = getBundledGameLibrary(library).games;
const games = getRecognizedGames(bundled);

test("classic freeware has public launch routes while God of Thunder remains import-only", () => {
  for (const target of ["soltys", "sfinx", "hires1"]) {
    const game = games.find((entry) => entry.target === target);
    assert.equal(game.importRequired, false, target);
    assert.ok(game.playHref.endsWith("/play"), target);
    assert.ok(game.readmeHref, target);
  }
  const got = games.find((entry) => entry.familyId === "got:got");
  assert.equal(got.importRequired, true);
  assert.equal(got.playHref, `${got.href}/play`);
});

test("every recognized family has one landing page, including separate full games and demos", () => {
  const families = games.map(getGameFamilyKey);
  assert.equal(new Set(families).size, games.length);
  assert.equal(new Set(games.map(({ slug }) => slug)).size, games.length);
  for (const game of getRecognizedGamePresentations()) {
    assert.ok(families.includes(getGameFamilyKey(game)), game.displayTitle);
  }
  assert.ok(games.find(({ slug }) => slug === "sfinx"));
  assert.equal(games.find(({ slug }) => slug === "the-secret-of-monkey-island").importRequired, true);
  assert.equal(games.find(({ slug }) => slug === "the-secret-of-monkey-island-demo").importRequired, false);
});

test("bundled URLs and launch data are preserved and imported games share the same play routes", () => {
  for (const game of bundled) {
    const page = games.find(({ slug }) => slug === game.slug);
    assert.equal(page.href, game.href);
    assert.equal(page.playHref, game.playHref);
    assert.equal(page.target, game.target);
    assert.deepEqual(page.skipIntro, game.skipIntro);
    assert.equal(page.importRequired, false);
  }
  for (const game of games.filter(({ importRequired }) => importRequired)) {
    assert.equal(game.playHref, `${game.href}/play`, game.displayTitle);
    assert.equal(game.badge, "Import your copy");
  }
});

test("original title parentheses survive routing and import pages disclose the file requirement", () => {
  assert.ok(games.find(({ slug }) => slug === "gnap-u-f-o-s"));
  const game = games.find(({ slug }) => slug === "day-of-the-tentacle");
  const metadata = buildGameMetadata(game);
  assert.match(metadata.title, /Day of the Tentacle.*Import & Play/);
  assert.match(metadata.description, /^Import your copy to play online\./);
  assert.ok(metadata.alternates.canonical.endsWith(game.href));
  assert.equal(buildGameStructuredData(game).isAccessibleForFree, undefined);
  assert.equal(buildGameStructuredData(games.find(({ target }) => target === "sky")).isAccessibleForFree, true);
});
