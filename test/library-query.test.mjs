import assert from "node:assert/strict";
import test from "node:test";
import { defaultLibraryQuery, libraryFacet, libraryGenre, libraryItems, queryLibrary } from "../app/home-shell/library-query.mjs";

const catalog = [
  { target: "z", displayTitle: "Zulu", genre: "Mystery", year: "1994", studio: "Studio B" },
  { target: "a", displayTitle: "Alpha", genre: "Comedy", year: "1992", studio: "Studio A" },
];
const local = { source: { id: "a", name: "Beta.zip" }, title: "Beta", game: { genre: "Mystery", year: "1994", studio: "Studio A" }, action: {} };
const remote = { source: { id: "link", url: "https://example.com/game.zip" }, title: "Unidentified", game: { year: "Archive" } };
const items = libraryItems(catalog, [local, remote]);
const titles = (query = {}) => queryLibrary(items, { ...defaultLibraryQuery, ...query }).map(({ title }) => title);

test("name sorting interleaves catalog and imported games while preserving actions", () => {
  assert.deepEqual(titles(), ["Alpha", "Beta", "Unidentified", "Zulu"]);
  assert.deepEqual(titles({ sort: "name-desc" }), ["Zulu", "Unidentified", "Beta", "Alpha"]);
  assert.equal(queryLibrary(items, defaultLibraryQuery)[1].action, local.action);
  assert.equal(new Set(items.map(({ key }) => key)).size, 4);
  assert.equal(items[0].title, "Zulu", "sorting must not reorder the input");
});

test("release year sorting keeps unknown dates last in both directions and breaks ties by title", () => {
  assert.deepEqual(titles({ sort: "year-desc" }), ["Beta", "Zulu", "Alpha", "Unidentified"]);
  assert.deepEqual(titles({ sort: "year-asc" }), ["Alpha", "Beta", "Zulu", "Unidentified"]);
});

test("genre filtering covers catalog and imported games and supports unknown genres", () => {
  assert.deepEqual(titles({ genre: "Mystery" }), ["Beta", "Zulu"]);
  assert.deepEqual(titles({ genre: "Unknown" }), ["Unidentified"]);
  assert.deepEqual(titles({ genre: "Comedy" }), ["Alpha"]);
  assert.deepEqual(titles({ genre: "Horror" }), []);
});

test("facets include unique values from the whole library and make missing metadata selectable", () => {
  assert.deepEqual(libraryFacet(items, "year"), ["1992", "1994", "Unknown"]);
  assert.deepEqual(libraryFacet(items, "genre"), ["Comedy", "Mystery", "Unknown"]);
  assert.deepEqual(queryLibrary([], defaultLibraryQuery), []);
});

test("genre and studio sorting use names to break ties", () => {
  const known = items.filter(({ source }) => !source?.url);
  assert.deepEqual(queryLibrary(known, { ...defaultLibraryQuery, sort: "genre-asc" }).map(({ title }) => title), ["Alpha", "Beta", "Zulu"]);
  assert.deepEqual(queryLibrary(known, { ...defaultLibraryQuery, sort: "studio-asc" }).map(({ title }) => title), ["Alpha", "Beta", "Zulu"]);
});

test("genre categories merge catalog and import capitalization and whitespace variants", () => {
  const catalogGame = { target: "sky", displayTitle: "Beneath a Steel Sky", genre: "Cyberpunk Adventure" };
  const importedGame = { genre: "  cyberpunk   adventure  " };
  const merged = libraryItems([catalogGame], [{
    source: { id: "sky-copy" }, title: "Steel Sky copy", game: importedGame,
  }]);
  assert.deepEqual(libraryFacet(merged, "genre"), ["Cyberpunk adventure"]);
  for (const genre of ["Cyberpunk adventure", "CYBERPUNK ADVENTURE"]) {
    assert.equal(queryLibrary(merged, { ...defaultLibraryQuery, genre }).length, 2);
  }
  assert.equal(catalogGame.genre, "Cyberpunk Adventure");
  assert.equal(importedGame.genre, "  cyberpunk   adventure  ");
});

test("synonymous categories filter and sort as a single genre while distinct genres stay separate", () => {
  const variants = [
    ["Zulu", "Comic Adventure"],
    ["Alpha", "Comedy adventure"],
    ["Beta", "Comedy Caper Adventure"],
    ["Epsilon", "Horror comedy adventure"],
    ["Delta", "Comedy Horror Adventure"],
  ].map(([displayTitle, genre], index) => ({ target: String(index), displayTitle, genre }));
  const combined = libraryItems(variants, []);
  assert.deepEqual(libraryFacet(combined, "genre"), [
    "Comedy adventure", "Comedy caper adventure", "Comedy horror adventure",
  ]);
  assert.deepEqual(queryLibrary(combined, { ...defaultLibraryQuery, genre: "Comic Adventure" })
    .map(({ title }) => title), ["Alpha", "Zulu"]);
  assert.deepEqual(queryLibrary(combined, { ...defaultLibraryQuery, genre: "Comedy horror adventure" })
    .map(({ title }) => title), ["Delta", "Epsilon"]);
  assert.deepEqual(queryLibrary(combined, { ...defaultLibraryQuery, sort: "genre-asc" })
    .map(({ title }) => title), ["Alpha", "Zulu", "Beta", "Delta", "Epsilon"]);
  assert.equal(libraryGenre({ genre: "Children's storybook adventure" }), "Interactive storybook");
  assert.equal(libraryGenre({ genre: "  " }), "Unknown");
  assert.equal(libraryGenre({}), "Unknown");
});
