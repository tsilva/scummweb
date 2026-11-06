import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import test from "node:test";
import swc from "next/dist/build/swc/index.js";
import { chooseGameVersion, formatVersionLabel, getVersionMetadata, getVersionSaveNamespace } from "../app/game-versions.mjs";
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
  assert.equal(groups[0].versions[1].label, "DOS");
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
  assert.deepEqual(getVersionMetadata({}, "Game (CD DOS, German).zip"), { language: "German", platform: "DOS", media: "CD", graphics: undefined, revision: undefined });
  assert.equal(getVersionMetadata({}, "Game.zip").language, undefined);
  assert.equal(getVersionMetadata({}, "Discworld 1 (CD DOS v2).zip").revision, "v2");
  const groups = libraryItems([], [imported("one", "Discworld (CD DOS).zip"), imported("two", "Discworld (CD DOS).zip")]);
  assert.equal(groups.length, 1);
  assert.notEqual(groups[0].versions[0].label, groups[0].versions[1].label);
  assert.doesNotMatch(groups[0].versions[0].label, /unknown|Local ZIP/i);
});

test("Beneath a Steel Sky labels show the bundled and imported CD revisions", () => {
  const catalog = getGamePresentation({ target: "sky", engineId: "sky", gameId: "sky",
    title: "Beneath a Steel Sky (v0.0372 CD/DOS)", platform: "pc", extra: "v0.0372 CD" });
  const local = imported("older-cd", "Beneath a Steel Sky (CD VGA).zip");
  local.archiveFiles = [["BASS/SKY.DNR", 40796, 1], ["BASS/SKY.DSK", 72429382, 2]];
  const [group] = libraryItems([catalog], [local]);
  assert.deepEqual(group.versions.map(({ label }) => label), ["DOS · CD · v0.0372", "DOS · CD · v0.0368"]);
  assert.equal(group.versions[1].source.id, "older-cd");
});

test("Sky revision metadata follows inspected files even when renamed or mislabeled", () => {
  const game = { engineId: "sky", gameId: "sky" };
  for (const dataSize of [72395713, 73123264]) {
    assert.deepEqual(getVersionMetadata(game, "My copy (CD VGA v0.0368).zip", [
      ["BASS\\SKY.DNR", 40780, 1], ["BASS\\SKY.DSK", dataSize, 2],
    ]), { language: undefined, platform: "DOS", media: "CD", graphics: "VGA", revision: "v0.0372" });
  }
  const local = imported("older-cd", "Beneath a Steel Sky.zip");
  local.source.archiveFiles = [["sky.dnr", 40796, 1], ["sky.dsk", 72429382, 2]];
  assert.equal(libraryItems([], [local])[0].versions[0].label, "DOS · CD · v0.0368");
});

test("Sky revision labels require a complete known file pair in one directory", () => {
  const game = { engineId: "sky", gameId: "sky" };
  for (const files of [
    [], [["sky.dnr", 40796, 1]],
    [["sky.dnr", 40796, 1], ["sky.dsk", 100, 2]],
    [["a/sky.dnr", 40796, 1], ["b/sky.dsk", 72429382, 2]],
    [["a/sky.dnr", 40796, 1], ["a/sky.dsk", 72429382, 2], ["b/sky.dnr", 40780, 3]],
  ]) assert.equal(getVersionMetadata(game, "Beneath a Steel Sky (CD VGA).zip", files).revision, undefined);
  assert.equal(getVersionMetadata({ engineId: "other", gameId: "sky" }, "Other (CD VGA).zip", [
    ["sky.dnr", 40796, 1], ["sky.dsk", 72429382, 2],
  ]).revision, undefined);
});

test("version labels show known edition details without storage types or guessed languages", () => {
  const groups = libraryItems([], [imported("feeble", "The Feeble Files (2CD Amiga).zip")]);
  const version = groups[0].versions[0];
  assert.equal(version.label, "Amiga · 2CD");
  assert.equal(version.game.language, undefined);
  const english = libraryItems([], [imported("en", "The Feeble Files (Windows, English).zip")]);
  assert.equal(english[0].versions[0].label, "English · Windows");
  const unspecified = libraryItems([], [imported("unknown", "The Feeble Files.zip")]);
  assert.equal(unspecified[0].versions[0].label, "Version 1");
});

test("all version fields use language, platform, media, graphics, revision order", () => {
  const versions = libraryItems([], [
    imported("ega", "Cruise for a Corpse (DOS CD English EGA v1.02).zip"),
    imported("vga", "Cruise for a Corpse (VGA English CD DOS v1.03).zip"),
  ])[0].versions;
  assert.deepEqual(versions.map(({ label }) => label), [
    "English · DOS · CD · EGA · v1.02", "English · DOS · CD · VGA · v1.03",
  ]);
  for (const version of versions) {
    assert.equal(version.game.badge, version.label);
    assert.equal(version.game.mobileBadge, version.label);
  }
});

test("graphics are omitted unless different known modes exist on the same platform", () => {
  const labelFor = (names) => libraryItems([], names.map((name, index) =>
    imported(String(index), `Cruise for a Corpse (${name}).zip`)))[0].versions.map(({ label }) => label);
  assert.deepEqual(labelFor(["English DOS CD VGA"]), ["English · DOS · CD"]);
  assert.deepEqual(labelFor(["English DOS CD VGA", "German DOS CD VGA"]), ["English · DOS · CD", "German · DOS · CD"]);
  assert.deepEqual(labelFor(["DOS VGA", "DOS"]), ["DOS · Copy 1", "DOS · Copy 2"]);
  assert.deepEqual(labelFor(["Amiga EGA", "DOS VGA"]), ["Amiga", "DOS"]);
  assert.deepEqual(labelFor(["DOS EGA", "DOS VGA", "Amiga VGA"]), ["DOS · EGA", "DOS · VGA", "Amiga"]);
});

test("unknown fields are hidden and structured or legacy metadata is normalized", () => {
  assert.equal(formatVersionLabel({ language: "unknown", platform: "N/A", media: "", graphics: "VGA", revision: "unspecified" }), "");
  assert.equal(formatVersionLabel(getVersionMetadata({ platform: "apple2", language: "en", media: "dvd", revision: "1.01a" })),
    "English · Apple II · DVD · v1.01a");
  assert.equal(formatVersionLabel(getVersionMetadata({ platform: "pc", language: "unknown", extra: "Latest version" })), "DOS");
  assert.equal(formatVersionLabel(getVersionMetadata({ platform: "pc", edition: "VGA / CD / v0.0368", language: "de" })),
    "German · DOS · CD · v0.0368");
  assert.equal(formatVersionLabel(getVersionMetadata({}, "English Adventure.zip")), "");
  assert.equal(formatVersionLabel(getVersionMetadata({}, "Game (CD DOS, Multilanguage).zip")), "Multilingual · DOS · CD");
  assert.equal(formatVersionLabel(getVersionMetadata({}, "Game (CD Windows-Linux-DOS).zip")), "Windows / Linux / DOS · CD");
});

test("duplicate copies use short suffixes and keep source identities and actions", () => {
  const copies = [imported("one", "Discworld (CD DOS).zip"), imported("two", "Discworld (CD DOS).zip")];
  const versions = libraryItems([], copies)[0].versions;
  assert.deepEqual(versions.map(({ label }) => label), ["DOS · CD · Copy 1", "DOS · CD · Copy 2"]);
  for (let i = 0; i < versions.length; i++) {
    assert.equal(versions[i].source, copies[i].source);
    assert.equal(versions[i].action, copies[i].action);
  }
});

test("the full bundled catalog and recognized aliases share the label formatter", async () => {
  const bundled = JSON.parse(await readFile(new URL("../scummvm-shell/games.json", import.meta.url), "utf8"));
  const artwork = JSON.parse(await readFile(new URL("../app/retro-game-artwork.json", import.meta.url), "utf8"));
  const groups = libraryItems(bundled.games.map((game) => getGamePresentation(game)), []);
  assert.equal(groups.length, bundled.games.length);
  for (const group of groups) {
    const version = group.versions[0];
    assert.equal(version.label, formatVersionLabel(version.game) || "Version 1");
    assert.doesNotMatch(version.label, /unknown|latest version|undefined/i);
    if (version.game.language) assert.ok(version.label.startsWith(version.game.language));
  }
  for (const record of Object.values(artwork)) {
    for (const alias of record.aliases || []) {
      const metadata = getVersionMetadata({}, `${alias}.zip`);
      const label = formatVersionLabel(metadata);
      if (metadata.language) assert.ok(label.startsWith(metadata.language), alias);
      assert.ok(!metadata.graphics || !label.includes(metadata.graphics), alias);
    }
  }
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

test("defaults use the newest known revision unless an available choice was remembered", () => {
  const versions = [
    { key: "older", game: { revision: "v0.0368" } },
    { key: "latest", source: {}, status: "available", game: { revision: "v0.0372" } },
    { key: "unknown", source: {}, status: "available", game: {} },
    { key: "missing", source: {}, status: "missing", game: { revision: "v1.0" } },
  ];
  assert.equal(chooseGameVersion(versions, null).key, "latest");
  assert.equal(chooseGameVersion(versions, "older").key, "older");
  assert.equal(chooseGameVersion(versions, "unknown").key, "unknown");
  assert.equal(chooseGameVersion(versions, "missing").key, "latest");
  assert.equal(chooseGameVersion(versions.toReversed(), null).key, "latest");
  assert.equal(chooseGameVersion([
    { key: "nine", game: { revision: "v1.9" } },
    { key: "ten", game: { revision: "v1.10" } },
  ], null).key, "ten");
});

test("save namespaces are stable, safe path components and isolate different source IDs", async () => {
  const first = await getVersionSaveNamespace("source:dos-english");
  assert.match(first, /^version-[0-9a-f]{64}$/);
  assert.equal(await getVersionSaveNamespace("source:dos-english"), first);
  assert.notEqual(await getVersionSaveNamespace("source:amiga-german"), first);
});
