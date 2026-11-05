import assert from "node:assert/strict";
import test from "node:test";
import bundled from "../data/bundled-game-files.json" with { type: "json" };
import catalog from "../scummvm-shell/games.json" with { type: "json" };
import { findBundledGame, gameDataFiles } from "../app/bundled-game-matching.mjs";
import { gameFileFingerprint } from "../app/local-game-matching.mjs";
import { libraryItems } from "../app/home-shell/library-query.mjs";
import { chooseGameVersion } from "../app/game-versions.mjs";

test("published signatures cover the current included catalog and retain legacy fingerprints", async () => {
  assert.equal(bundled.version, 1);
  assert.deepEqual(Object.keys(bundled.games).sort(), catalog.games.map(({ target }) => target).sort());
  for (const game of catalog.games) {
    const archive = bundled.games[game.target];
    assert.equal(archive.url, `https://scummvm-games.tsilva.eu/${game.gameId}.zip`);
    assert.equal(await gameFileFingerprint("zip", archive.files), archive.fingerprint);
    assert.equal(findBundledGame({ fingerprint: archive.fingerprint }, catalog.games), game);
    assert.equal(findBundledGame({ archiveFiles: archive.files }, catalog.games), game);
  }
});

test("repackaged game data matches independently of filename, case, wrapper and documentation", () => {
  const files = gameDataFiles(bundled.games.sky.files)
    .map(([name, ...rest]) => [`BASS/${name.toUpperCase()}`, ...rest]);
  files.push(["manual.pdf", 100, 2], ["BASS/README.TXT", 10, 3], ["BASS/SKY.EXE", 20, 4]);
  assert.equal(findBundledGame({ name: "unrecognized.zip", archiveFiles: files }, catalog.games)?.target, "sky");
});

test("different revisions, missing files and additional game data stay separate", () => {
  const files = gameDataFiles(bundled.games.sky.files);
  for (const candidate of [
    files.map(([name, size, crc], index) => [name, size, index === 0 ? crc ^ 1 : crc]),
    files.map(([name, size, crc], index) => [name, index === 0 ? size + 1 : size, crc]),
    files.slice(1), [...files, ["translation.dat", 10, 1]], [],
  ]) assert.equal(findBundledGame({ name: "Beneath a Steel Sky (CD DOS).zip", archiveFiles: candidate }, catalog.games), null);
});

test("verified files override a stale fingerprint and no data means no guessed match", () => {
  assert.equal(findBundledGame({ name: "Beneath a Steel Sky.zip" }, catalog.games), null);
  assert.equal(findBundledGame({ fingerprint: bundled.games.sky.fingerprint,
    archiveFiles: [["different.dat", 10, 1]] }, catalog.games), null);
  const game = { target: "sky", importRequired: true };
  assert.equal(findBundledGame({ archiveFiles: bundled.games.sky.files }, [game]), null);
  assert.equal(findBundledGame({ archiveFiles: bundled.games.sky.files }, [{ target: "sky" }, { target: "sky" }]), null);
});

test("existing duplicate imports are excluded from versions without deleting their source or save identity", () => {
  const game = { target: "sky", gameId: "sky", engineId: "sky", displayTitle: "Beneath a Steel Sky", slug: "beneath-a-steel-sky" };
  const source = { id: "saved-import", name: "Beneath a Steel Sky (CD VGA).zip", fingerprint: bundled.games.sky.fingerprint };
  const entries = [{ source, game: { ...game, saveVersionId: source.id }, title: game.displayTitle }];
  const groups = libraryItems([game], entries);
  assert.equal(groups.length, 1);
  assert.deepEqual(groups[0].versions.map(({ key }) => key), ["catalog:sky"]);
  assert.equal(entries[0].source, source);
  assert.equal(entries[0].game.saveVersionId, "saved-import");
  const oldSource = { id: "old", name: source.name };
  assert.equal(libraryItems([game], [{ ...entries[0], source: oldSource,
    archiveFiles: bundled.games.sky.files }])[0].versions.length, 1);
  assert.equal(libraryItems([game], [{ ...entries[0], source: oldSource }])[0].versions.length, 1);
  assert.equal(libraryItems([game], [{ ...entries[0], source: oldSource,
    archiveFiles: [["different.dat", 10, 1]] }])[0].versions.length, 2);
  assert.equal(libraryItems([{ ...game, importRequired: true }], [{ ...entries[0], source: oldSource }])[0].versions.length, 2);
});

test("bundled is the default but an explicit choice of a distinct imported release is remembered", () => {
  const included = { key: "catalog:sky", game: {}, source: null };
  const imported = { key: "source:floppy", game: { language: "English" }, source: {}, status: "available" };
  assert.equal(chooseGameVersion([imported, included], null, "English"), included);
  assert.equal(chooseGameVersion([imported, included], imported.key, "English"), imported);
});
