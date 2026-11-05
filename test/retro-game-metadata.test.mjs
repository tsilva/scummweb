import assert from "node:assert/strict";
import fs from "node:fs";
import { createHash } from "node:crypto";
import test from "node:test";
import { getImportedGamePresentation } from "../app/game-presentation.js";
import storage from "../data/artwork-storage.json" with { type: "json" };

const artwork = JSON.parse(fs.readFileSync(new URL("../app/retro-game-artwork.json", import.meta.url)));

test("remakes retain separate identities, labels and edition-matched artwork", () => {
  const originals = { "sci:pq1sci": "agi:pq1", "sci:qfg1vga": "sci:qfg1", "sci:sq1sci": "agi:sq1" };
  for (const [id, game] of Object.entries(artwork).filter(([, game]) => /remake/i.test(game.summary))) {
    assert.equal(game.editionLabel, id === "sci:kq1sci" ? "SCI Remake" : "VGA Remake", id);
    assert.equal(game.artworkFrom, undefined, id);
    for (const source of game.sources.screenshots) {
      assert.ok(source.url.includes(`/sci/${id.split(":")[1]}/`), `${id} borrows another game's capture`);
    }
    const original = artwork[originals[id]];
    if (original) {
      assert.notEqual(game.posterImage, original.posterImage, id);
      assert.ok(game.screenshots.every((image) => !original.screenshots.includes(image)), id);
    }
    const imported = getImportedGamePresentation(`${game.aliases[0]}.zip`);
    assert.equal(imported.familyId, id);
    assert.equal(imported.displayTitle, game.title);
    assert.equal(imported.editionLabel, game.editionLabel);
  }
});

test("shared original and remake titles stay unidentified without an edition", () => {
  for (const [originalId, remakeId] of [
    ["agi:pq1", "sci:pq1sci"],
    ["agi:sq1", "sci:sq1sci"],
    ["sci:qfg1", "sci:qfg1vga"],
  ]) {
    const title = artwork[originalId].title;
    assert.equal(getImportedGamePresentation(`${title}.zip`), null, title);
    assert.equal(getImportedGamePresentation(`${title} (German).zip`), null, title);
    for (const id of [originalId, remakeId]) {
      for (const alias of artwork[id].aliases) {
        assert.equal(getImportedGamePresentation(`${alias}.zip`)?.familyId, id, alias);
      }
    }
  }
  assert.equal(getImportedGamePresentation("The Dig.zip")?.familyId, "scumm:dig");
});

test("recognized galleries have three distinct managed images with explicit source gaps", () => {
  const limited = new Map([["local:road", 1], ["sci:funseeker", 2]]);
  for (const [id, game] of Object.entries(artwork)) {
    assert.equal(game.screenshots.length, limited.get(id) || 3, id);
    const hashes = game.screenshots.map((path) => {
      if (storage.published) {
        assert.ok(storage.files[path], `${id} needs a published image mapping`);
        return storage.files[path].sha256;
      }
      const bytes = fs.readFileSync(new URL(`../scummvm-shell${path}`, import.meta.url));
      return createHash("sha256").update(bytes).digest("hex");
    });
    assert.equal(new Set(hashes).size, hashes.length, `${id} repeats a capture`);
    const recognized = getImportedGamePresentation(`${game.aliases[0]}.zip`);
    assert.equal(recognized?.screenshots.length, game.screenshots.length, `${id} loses its gallery during import`);
  }
  assert.equal(getImportedGamePresentation("Sfinx.zip").screenshots.length, 3);
});

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
