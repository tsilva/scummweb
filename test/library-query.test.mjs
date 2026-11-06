import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { defaultLibraryQuery, libraryFacet, libraryGenre, libraryItems, queryLibrary } from "../app/home-shell/library-query.mjs";
import { getRecognizedGames } from "../app/recognized-games.mjs";

const catalog = [
  { target: "z", displayTitle: "Zulu", genre: "Mystery", year: "1994", studio: "Studio B" },
  { target: "a", displayTitle: "Alpha", genre: "Comedy", year: "1992", studio: "Studio A" },
];
const local = { source: { id: "a", name: "Beta.zip" }, title: "Beta", game: { genre: "Mystery", year: "1994", studio: "Studio A" }, action: {} };
const remote = { source: { id: "link", url: "https://example.com/game.zip" }, title: "Unidentified", game: { year: "Archive" } };
const items = libraryItems(catalog, [local, remote]);
const titles = (query = {}) => queryLibrary(items, { ...defaultLibraryQuery, ...query }).map(({ title }) => title);

test("catalog and imported Space Quest installments sort together in both directions", () => {
  const series = libraryItems([
    { target: "sq6", displayTitle: "Space Quest 6: Roger Wilco in the Spinal Frontier", year: "1995" },
    { target: "sq2", displayTitle: "Space Quest II: Chapter II - Vohaul's Revenge", year: "1995" },
    { target: "sq1", displayTitle: "Space Quest: The Sarien Encounter", year: "1995" },
  ], [{
    source: { id: "sq3" }, title: "Space Quest III: The Pirates of Pestulon", game: { year: "1995" },
  }]);
  const ordered = ["sq1", "sq2", "sq3", "sq6"];
  const ids = (sort) => queryLibrary(series, { ...defaultLibraryQuery, sort }).map((item) => item.source?.id || item.game.target);
  assert.deepEqual(ids("name-asc"), ordered);
  assert.deepEqual(ids("name-desc"), ordered.toReversed());
  assert.deepEqual(ids("year-desc"), ordered, "equal years use series order");
  assert.equal(series[0].game.target, "sq6", "sorting preserves the source order");
});

test("the real catalog keeps numbered and irregularly named series in sequence", () => {
  const games = getRecognizedGames([]);
  const sorted = queryLibrary(libraryItems(games, []), defaultLibraryQuery);
  const series = [
    ["agi:sq1", "sci:sq1sci", "agi:sq2", "sci:sq3", "sci:sq4", "sci:sq5", "sci:sq6"],
    ["sci:kq1sci", "agi:kq2", "agi:kq3", "sci:kq4sci", "sci:kq5", "sci:kq6", "sci:kq7"],
    ["agi:pq1", "sci:pq1sci", "sci:pq2", "sci:pq3", "sci:pq4"],
    ["sci:lsl1sci", "sci:lsl2", "sci:lsl3", "sci:lsl5", "sci:lsl6hires", "sci:lsl7"],
    ["sword1:sword1", "sword2:sword2", "sword25:sword25"],
    ["scumm:monkey", "scumm:monkey2", "scumm:comi"],
    ["kyra:kyra1", "kyra:kyra2", "kyra:kyra3"],
    ["gob:gob1", "gob:gob2", "gob:gob3"],
    ["sci:gk1", "sci:gk2"],
  ];
  for (const families of series) {
    const expected = families.filter((id) => games.some((game) => game.familyId === id));
    assert.equal(expected.length, families.length, "fixtures must exist in the catalog");
    assert.deepEqual(sorted.filter(({ game }) => families.includes(game.familyId)).map(({ game }) => game.familyId), expected);
    assert.deepEqual(games.filter((game) => families.includes(game.familyId)).map((game) => game.familyId), expected);
  }
  const first = games.find((game) => game.familyId === "agi:sq1");
  assert.equal(first.displayTitle, "Space Quest: The Sarien Encounter");
  assert.equal(first.slug, "space-quest-the-sarien-encounter");
});

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
  assert.deepEqual(libraryFacet(items, "genre"), ["Comedy", "Mystery & thriller", "Unknown"]);
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
  assert.deepEqual(libraryFacet(merged, "genre"), ["Science fiction"]);
  for (const genre of ["Science fiction", "Cyberpunk adventure", "CYBERPUNK ADVENTURE"]) {
    assert.equal(queryLibrary(merged, { ...defaultLibraryQuery, genre }).length, 2);
  }
  assert.equal(catalogGame.genre, "Cyberpunk Adventure");
  assert.equal(importedGame.genre, "  cyberpunk   adventure  ");
});

test("related subgenres filter and sort as a single broad category", () => {
  const variants = [
    ["Zulu", "Comic Adventure"],
    ["Alpha", "Comedy adventure"],
    ["Beta", "Comedy Caper Adventure"],
    ["Epsilon", "Horror comedy adventure"],
    ["Delta", "Comedy Horror Adventure"],
  ].map(([displayTitle, genre], index) => ({ target: String(index), displayTitle, genre }));
  const combined = libraryItems(variants, []);
  assert.deepEqual(libraryFacet(combined, "genre"), [
    "Comedy", "Horror",
  ]);
  assert.deepEqual(queryLibrary(combined, { ...defaultLibraryQuery, genre: "Comic Adventure" })
    .map(({ title }) => title), ["Alpha", "Beta", "Zulu"]);
  assert.deepEqual(queryLibrary(combined, { ...defaultLibraryQuery, genre: "Comedy horror adventure" })
    .map(({ title }) => title), ["Delta", "Epsilon"]);
  assert.deepEqual(queryLibrary(combined, { ...defaultLibraryQuery, sort: "genre-asc" })
    .map(({ title }) => title), ["Alpha", "Beta", "Zulu", "Delta", "Epsilon"]);
  assert.equal(libraryGenre({ genre: "Children's storybook adventure" }), "Family & education");
  assert.equal(libraryGenre({ genre: "  " }), "Unknown");
  assert.equal(libraryGenre({}), "Unknown");
});

test("broad categories preserve meaningful distinctions and classify hybrid genres consistently", () => {
  const examples = {
    "Action & arcade": ["Action adventure", "Arcade action"],
    Adventure: ["Archaeological adventure", "Historical adventure", "Jungle adventure", "Swashbuckling adventure", "Point-and-click adventure", "ScummVM Adventure"],
    Comedy: ["Adult comedy adventure", "Cartoon comedy adventure", "Pirate comedy adventure", "Western comedy adventure"],
    "Family & education": ["Children's arcade action", "Children's fantasy adventure", "Educational time-travel adventure", "Environmental adventure", "Interactive storybook"],
    Fantasy: ["Arthurian adventure", "Fantasy comedy", "Fantasy puzzle adventure", "Musical fantasy adventure"],
    Horror: ["Psychological horror adventure", "Interactive movie horror", "Horror puzzle adventure"],
    "Mystery & thriller": ["Conspiracy Adventure", "Crime thriller adventure", "Detective adventure", "Noir Thriller", "Police procedural adventure", "Supernatural mystery adventure"],
    Puzzle: ["Claymation puzzle adventure", "Exploration puzzle adventure", "Surreal puzzle adventure", "Puzzle collection"],
    "Role-playing": ["Dungeon-crawling role-playing game", "Fantasy role-playing game", "Horror role-playing adventure"],
    "Science fiction": ["Cyberpunk Adventure", "Science-fiction comedy", "Science-fiction mystery", "Science-fiction puzzle adventure", "Time-travel comedy adventure"],
    Simulation: ["Life simulation board game", "Espionage adventure and simulation"],
  };
  for (const [category, labels] of Object.entries(examples)) {
    assert.equal(libraryGenre({ genre: category }), category, "category labels must filter their own games");
    for (const genre of labels) assert.equal(libraryGenre({ genre }), category, genre);
  }
});

test("the full artwork catalog uses eleven broad genres and every game remains filterable", async () => {
  const artwork = JSON.parse(await readFile(new URL("../app/retro-game-artwork.json", import.meta.url), "utf8"));
  const games = Object.entries(artwork).map(([target, game]) => ({ ...game, target, displayTitle: game.title }));
  const all = libraryItems(games, []);
  const categories = libraryFacet(all, "genre");
  assert.deepEqual(categories, [
    "Action & arcade", "Adventure", "Comedy", "Family & education", "Fantasy", "Horror",
    "Mystery & thriller", "Puzzle", "Role-playing", "Science fiction", "Simulation",
  ]);
  const filtered = categories.flatMap((genre) => queryLibrary(all, { ...defaultLibraryQuery, genre }));
  assert.equal(filtered.length, all.length);
  assert.equal(new Set(filtered.map(({ key }) => key)).size, all.length);
});
