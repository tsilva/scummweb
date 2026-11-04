import assert from "node:assert/strict";
import test from "node:test";
import { defaultLibraryQuery, libraryFacet, libraryItems, queryLibrary } from "../app/home-shell/library-query.mjs";

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

test("search, genre, year and source filters work together", () => {
  assert.deepEqual(titles({ search: "  BEt  ", genre: "Mystery", year: "1994", source: "local" }), ["Beta"]);
  assert.deepEqual(titles({ genre: "Mystery", source: "catalog" }), ["Zulu"]);
  assert.deepEqual(titles({ source: "remote", year: "Unknown" }), ["Unidentified"]);
  assert.deepEqual(titles({ genre: "Comedy", year: "1994" }), []);
});

test("facets include unique values from the whole library and make missing metadata selectable", () => {
  assert.deepEqual(libraryFacet(items, "year"), ["1992", "1994", "Unknown"]);
  assert.deepEqual(libraryFacet(items, "genre"), ["Comedy", "Mystery", "Unknown"]);
  assert.deepEqual(queryLibrary([], defaultLibraryQuery), []);
});

test("genre and studio sorting use names to break ties", () => {
  const known = items.filter(({ sourceType }) => sourceType !== "remote");
  assert.deepEqual(queryLibrary(known, { ...defaultLibraryQuery, sort: "genre-asc" }).map(({ title }) => title), ["Alpha", "Beta", "Zulu"]);
  assert.deepEqual(queryLibrary(known, { ...defaultLibraryQuery, sort: "studio-asc" }).map(({ title }) => title), ["Alpha", "Beta", "Zulu"]);
});
