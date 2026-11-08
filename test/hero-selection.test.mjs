import assert from "node:assert/strict";
import test from "node:test";
import { buildGameExitHref, readHeroSelection } from "../app/home-shell/hero-selection.mjs";
import { libraryItems } from "../app/home-shell/library-items.mjs";

const catalogGame = { target: "sky", engineId: "sky", gameId: "sky", displayTitle: "Beneath a Steel Sky" };

test("published game routes take precedence over legacy slideshow fragments", () => {
  assert.equal(buildGameExitHref({ ...catalogGame, href: "/beneath-a-steel-sky" }), "/beneath-a-steel-sky");
  assert.equal(buildGameExitHref({ ...catalogGame, slug: "beneath-a-steel-sky" }), "/beneath-a-steel-sky");
  assert.equal(buildGameExitHref({ ...catalogGame, href: "//untrusted.example" }), "/#slide=sky%3Asky%3Afull");
});

function selectionFor(game) {
  return readHeroSelection(new URL(buildGameExitHref(game), "https://example.test").hash);
}

test("catalog and recognized imported editions return to their shared slideshow group", () => {
  const imported = { ...catalogGame, target: "sky-floppy", saveVersionId: "floppy", recentGameId: "source:floppy" };
  const groups = libraryItems([catalogGame], [{ game: imported, source: { id: "floppy" } }]);
  assert.equal(selectionFor(catalogGame), groups[0].key);
  assert.equal(selectionFor(imported), groups[0].key);
  assert.equal(buildGameExitHref(catalogGame), "/#slide=sky%3Asky%3Afull");
});

test("demo selections remain separate from the full game", () => {
  const demo = { ...catalogGame, displayTitle: "Beneath a Steel Sky (Demo)" };
  const groups = libraryItems([catalogGame, demo], []);
  assert.equal(selectionFor(demo), groups[1].key);
  assert.notEqual(selectionFor(demo), selectionFor(catalogGame));
});

test("unrecognized imports use their saved source ID, including launches with legacy saves", () => {
  const game = { displayTitle: "My game", saveVersionId: "custom / game" };
  const groups = libraryItems([], [{ game, source: { id: game.saveVersionId } }]);
  assert.equal(selectionFor(game), groups[0].key);
  assert.equal(selectionFor({ displayTitle: game.displayTitle, recentGameId: groups[0].key }), groups[0].key);
});

test("games without family metadata use the catalog target; anonymous ZIPs return home", () => {
  const game = { target: "custom", displayTitle: "Custom" };
  assert.equal(selectionFor(game), libraryItems([game], [])[0].key);
  assert.equal(buildGameExitHref(null), "/");
  assert.equal(buildGameExitHref({}), "/");
});

test("other fragments and malformed selections leave the default hero intact", () => {
  for (const hash of ["", "#library", "#game-sky", "#slide=", "#slide=%E0%A4%A"]) {
    assert.equal(readHeroSelection(hash), null);
  }
});
