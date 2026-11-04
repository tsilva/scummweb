import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const artwork = JSON.parse(fs.readFileSync(new URL("../app/retro-game-artwork.json", import.meta.url)));

test("every recognized imported title has specific dashboard metadata and attribution", () => {
  for (const [id, game] of Object.entries(artwork)) {
    for (const field of ["summary", "studio", "genre"]) {
      assert.ok(typeof game[field] === "string" && game[field].trim(), `${id} needs ${field}`);
    }
    assert.doesNotMatch(game.summary, /^Play your local copy|dedicated ScummWEB page/);
    assert.notEqual(game.studio, "ScummVM Runtime", `${id} needs its developer credit`);
    assert.notEqual(game.genre, "ScummVM Adventure", `${id} needs a genre`);
    assert.ok(game.sources.metadata.length || game.metadataNote, `${id} needs sources or an explicit attribution gap`);
  }
});

test("matching artwork and metadata do not add personal titles to the public playable catalog", () => {
  const catalog = JSON.parse(fs.readFileSync(new URL("../scummvm-shell/games.json", import.meta.url)));
  assert.equal(catalog.games.some(({ target }) => target === "lsl7"), false);
  assert.equal(artwork["sci:lsl7"].studio, "Sierra On-Line");
  assert.match(artwork["sci:lsl7"].summary, /cruise ship/);
});
