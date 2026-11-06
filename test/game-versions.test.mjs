import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import test from "node:test";
import swc from "next/dist/build/swc/index.js";
import { chooseGameVersion, getVersionMetadata, getVersionSaveNamespace } from "../app/game-versions.mjs";
import { libraryItems } from "../app/home-shell/library-query.mjs";

const presentationUrl = new URL("../app/game-presentation.js", import.meta.url);
await swc.loadBindings();
const { code } = await swc.transform(await readFile(presentationUrl, "utf8"), {
  filename: presentationUrl.pathname, swcrc: false, configFile: false, module: { type: "commonjs" },
  jsc: { parser: { syntax: "ecmascript", jsx: true }, transform: { react: { runtime: "automatic" } } },
});
const compiled = { exports: {} };
const require = createRequire(presentationUrl);
runInNewContext(code, { module: compiled, exports: compiled.exports,
  require: (name) => name === "./asset-paths.js" ? { getVersionedSiteAssetPath: (path) => path } : require(name) });
const { getGamePresentation, getImportedGamePresentation } = compiled.exports;

function imported(id, name, status = "available") {
  return { source: { id, name }, status, game: getImportedGamePresentation(name), title: getImportedGamePresentation(name).displayTitle,
    action: { onClick() {} } };
}

test("platform editions share one recognized game card with distinct launch sources", () => {
  const editions = [imported("atari", "Cruise for a Corpse (Atari ST).zip"), imported("dos", "Cruise for a Corpse (VGA DOS).zip")];
  const groups = libraryItems([], editions);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].versions.length, 2);
  assert.match(groups[0].versions[0].label, /Atari ST/);
  assert.match(groups[0].versions[1].label, /DOS.*VGA/);
  assert.equal(groups[0].versions[0].action, editions[0].action);
  assert.equal(groups[0].versions[1].source.id, "dos");
});

test("catalog and localized imported titles use engine identity rather than title spelling", () => {
  const catalog = getGamePresentation({ target: "drascula", gameId: "drascula", engineId: "drascula",
    displayTitle: "Drascula: The Vampire Strikes Back", title: "Drascula (DOS/English)", slug: "drascula" });
  const local = imported("local", "Drascula The Vampire Strikes Back (CD DOS, Multilanguage).zip");
  local.source.archiveFiles = [["localized.dat", 100, 123]];
  const groups = libraryItems([catalog], [local]);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].dialogId, "game-drascula");
  assert.equal(groups[0].versions[0].game.language, "English");
  assert.equal(groups[0].versions[1].game.language, "Multilingual");
});

test("demos and unrelated or unidentified titles remain separate", () => {
  const full = getGamePresentation({ engineId: "scumm", gameId: "monkey", target: "monkey", displayTitle: "The Secret of Monkey Island" });
  const demo = { ...full, target: "monkey-demo", displayTitle: "The Secret of Monkey Island (Demo)" };
  const unrelated = { ...full, engineId: "other", familyId: "other:monkey" };
  const unknowns = ["one", "two"].map((id) => ({ source: { id }, game: { displayTitle: "Same name" }, title: "Same name" }));
  assert.equal(libraryItems([full, demo, unrelated], unknowns).length, 5);
});

test("version labels retain real metadata and distinguish identical copies", () => {
  assert.deepEqual(getVersionMetadata({}, "Game (CD DOS, German).zip"), { platform: "DOS", language: "German", edition: "CD" });
  assert.equal(getVersionMetadata({}, "Game.zip").language, undefined);
  assert.equal(getVersionMetadata({}, "Discworld 1 (CD DOS v2).zip").edition, "CD / v2");
  const groups = libraryItems([], [imported("one", "Discworld (CD DOS).zip"), imported("two", "Discworld (CD DOS).zip")]);
  assert.equal(groups.length, 1);
  assert.notEqual(groups[0].versions[0].label, groups[0].versions[1].label);
  assert.doesNotMatch(groups[0].versions[0].label, /unknown|Local ZIP/i);
});

test("version labels show known edition details without storage types or guessed languages", () => {
  const groups = libraryItems([], [imported("feeble", "The Feeble Files (2CD Amiga).zip")]);
  const version = groups[0].versions[0];
  assert.equal(version.label, "Amiga");
  assert.equal(version.game.language, undefined);
  const english = libraryItems([], [imported("en", "The Feeble Files (Windows, English).zip")]);
  assert.equal(english[0].versions[0].label, "Windows · English");
  const unspecified = libraryItems([], [imported("unknown", "The Feeble Files.zip")]);
  assert.equal(unspecified[0].versions[0].label, "Version 1");
});

test("defaults prefer a remembered available version then browser language and available alternatives", () => {
  const versions = [
    { key: "missing", source: {}, status: "missing", game: { language: "English" } },
    { key: "de", source: {}, status: "available", game: { language: "German" } },
    { key: "en", source: {}, status: "session", game: { language: "English" } },
  ];
  assert.equal(chooseGameVersion(versions, "de", "English").key, "de");
  assert.equal(chooseGameVersion(versions, "missing", "English").key, "en");
  assert.equal(chooseGameVersion(versions, "removed", "German").key, "de");
  assert.equal(chooseGameVersion([versions[0]], null).key, "missing");
});

test("save namespaces are stable, safe path components and isolate different source IDs", async () => {
  const first = await getVersionSaveNamespace("source:dos-english");
  assert.match(first, /^version-[0-9a-f]{64}$/);
  assert.equal(await getVersionSaveNamespace("source:dos-english"), first);
  assert.notEqual(await getVersionSaveNamespace("source:amiga-german"), first);
});
