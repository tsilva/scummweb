import assert from "node:assert/strict";
import test from "node:test";
import { buildSkipIntroLaunchSrc, normalizeSkipIntroConfig } from "../app/skip-intro-config.mjs";

test("normalizes save-slot skip-intro configs", () => {
  assert.deepEqual(
    normalizeSkipIntroConfig({
      strategy: "save-slot",
      slot: 0,
      saveFiles: ["SKY-VM.000", "SKY-VM.000"],
    }),
    {
      strategy: "save-slot",
      slot: 0,
      saveFiles: ["SKY-VM.000"],
    }
  );
});

test("infers save-slot configs when slot metadata is present", () => {
  assert.deepEqual(
    normalizeSkipIntroConfig({
      slot: 0,
      saveFiles: ["queen.s00"],
    }),
    {
      strategy: "save-slot",
      slot: 0,
      saveFiles: ["queen.s00"],
    }
  );
});

test("rejects legacy keypress skip-intro configs", () => {
  assert.equal(
    normalizeSkipIntroConfig({
      strategy: "keypress",
      key: "Escape",
      pressCount: 5,
      pressIntervalMs: 1000,
    }),
    null
  );
});

test("rejects incomplete save-slot configs", () => {
  assert.equal(
    normalizeSkipIntroConfig({
      strategy: "save-slot",
      slot: 2,
      saveFiles: [],
    }),
    null
  );
});

test("catalog intro checkpoints match their rebuild overrides and ship intact", async () => {
  const { readFile, readdir } = await import("node:fs/promises");
  const { createHash } = await import("node:crypto");
  const { gunzipSync } = await import("node:zlib");
  const shell = new URL("../scummvm-shell/", import.meta.url);
  const library = JSON.parse(await readFile(new URL("games.json", shell), "utf8"));
  const overrides = JSON.parse(await readFile(new URL("../launcher-game-overrides.json", import.meta.url), "utf8"));
  const manifest = JSON.parse(await readFile(new URL("runtime-assets.json", shell), "utf8"));
  // Retain original text/title prompts. SQ6’s demo disables saving and loading,
  // so its original title, instructions and opening remain the startup path.
  // Primordia and Technobabylon retain original Start menus while saves are unreliable.
  // Myst’s save-disabled demo retains its original preview menu after native intro skip.
  const directPrompt = new Set(["zork1", "zork2", "zork3", "gob2-demo", "gob3-demo", "sq6-demo", "primordia-demo", "technobabylon-demo"]);
  // Full Throttle's demo disables saving before its first decision; its
  // verified native intro action skips in place without a seeded save.
  const nativeOnly = new Set(["ft-demo", "samnmax-demo", "dig-demo", "sword1-demo", "dw-demo", "gob1-demo", "myst-demo", "puttputt-demo", "freddi-demo", "pajama-demo", "spyfox-demo"]);
  const nativeChoice = new Set(["nippon-amiga", "gk1-demo"]);
  assert.deepEqual(new Set(library.games.filter((game) => !game.skipIntro).map((game) => game.target)),
    new Set([...directPrompt, ...nativeOnly, ...nativeChoice]), "unseeded editions need a direct prompt, native intro choice or verified native intro action");
  const configuredTargets = new Set();
  for (const game of library.games) {
    if (!game.skipIntro) continue;
    configuredTargets.add(game.target);
    const config = normalizeSkipIntroConfig(game.skipIntro);
    assert.ok(config, `${game.target}: valid checkpoint metadata`);
    assert.deepEqual(game.skipIntro, overrides.byTarget[game.target].skipIntro,
      `${game.target}: rebuild must preserve the checkpoint`);
    for (const file of config.saveFiles || []) {
      assert.equal(file.includes("/"), false, "checkpoint names must stay in the target directory");
      const assetPath = `/launcher/skip-intro/${game.target}/${file}`;
      const bytes = await readFile(new URL(assetPath.slice(1), shell));
      assert.ok(bytes.length > 0, `${assetPath}: checkpoint must not be empty`);
      if (file.endsWith(".gsv")) assert.doesNotThrow(() => gunzipSync(bytes), `${assetPath}: complete compressed save`);
      if (game.engineId === "ags") {
        assert.equal(bytes.toString("ascii", 0, 4), "RGMH");
        const thumbnailStart = bytes.readUInt32LE(8) + Number(bytes.readBigUInt64LE(12));
        const thumbnailSize = bytes.readUInt32LE(20);
        assert.equal(bytes.toString("ascii", thumbnailStart, thumbnailStart + 2), "BM");
        assert.equal(thumbnailStart + thumbnailSize, bytes.length, `${assetPath}: complete AGS save and thumbnail`);
      }
      assert.equal(manifest.files[assetPath],
        `sha-${createHash("sha256").update(bytes).digest("hex").slice(0, 24)}`,
        `${assetPath}: served bytes must match their immutable asset fingerprint`);
    }
  }
  const directories = await readdir(new URL("launcher/skip-intro/", shell), { withFileTypes: true });
  for (const directory of directories.filter((entry) => entry.isDirectory())) {
    assert.ok(configuredTargets.has(directory.name), `${directory.name}: no orphaned checkpoint assets`);
  }
});

test("each bundled engine offering Skip intro ships the native gameplay signal", async () => {
  const { readFile } = await import("node:fs/promises");
  const shell = new URL("../scummvm-shell/", import.meta.url);
  const { games } = JSON.parse(await readFile(new URL("games.json", shell), "utf8"));
  const engines = new Set(games.filter((game) => game.skipIntro && !game.skipIntro.checkpointOnly)
    .map((game) => game.engineId));
  for (const engine of engines) {
    const plugin = await readFile(new URL(`data/plugins/lib${engine}.so`, shell));
    assert.ok(plugin.includes("__scummwebReportGameplayStarted"), `${engine} must report when gameplay begins`);
  }
});

test("normalizes a native intro skip without requiring or inventing a save slot", () => {
  assert.deepEqual(normalizeSkipIntroConfig({ strategy: "boot-param", bootParam: 1 }),
    { strategy: "boot-param", bootParam: 1 });
  for (const bootParam of [0, -1, 1.5, "invalid", Infinity]) {
    assert.equal(normalizeSkipIntroConfig({ strategy: "boot-param", bootParam }), null);
  }
});

test("native intro launches preserve file handoff and exit routes without seeding saves", () => {
  const result = new URL(buildSkipIntroLaunchSrc(
    "/scummvm.html?localGame=1&catalogGame=nippon&exitTo=%2Fnippon-safes-inc&skipIntroTarget=nippon-amiga#nippon-amiga",
    "nippon-amiga", { strategy: "boot-param", bootParam: 1 }, "https://example.test"), "https://example.test");
  assert.equal(result.searchParams.get("localGame"), "1");
  assert.equal(result.searchParams.get("catalogGame"), "nippon");
  assert.equal(result.searchParams.get("exitTo"), "/nippon-safes-inc");
  assert.equal(result.searchParams.has("skipIntroTarget"), false);
  assert.equal(decodeURIComponent(result.hash), "#-b 1 nippon-amiga");
});

test("save checkpoint launches keep their native slot and seed target", () => {
  const result = new URL(buildSkipIntroLaunchSrc("/scummvm.html?localGame=1#soltys", "soltys",
    { strategy: "save-slot", slot: 1, saveFiles: ["soltys.001"] }, "https://example.test"), "https://example.test");
  assert.equal(result.searchParams.get("skipIntroTarget"), "soltys");
  assert.equal(result.searchParams.get("localGame"), "1");
  assert.equal(decodeURIComponent(result.hash), "#-x 1 soltys");
});

test("Queen's startup checkpoint never occupies the player's native slot", async () => {
  const { readFile } = await import("node:fs/promises");
  const { runInNewContext } = await import("node:vm");
  const template = await readFile(new URL("../web-shell/scummvm.html", import.meta.url), "utf8");
  const start = template.indexOf("function setupSkipIntroSaves()");
  const end = template.indexOf("let localGameStatus", start);
  const playerPath = "/home/web_user/.local/share/scummvm/saves/queen.s00";
  const player = Uint8Array.of(6);
  const checkpoint = Uint8Array.of(2, 3);
  const files = new Map([[playerPath, player]]);
  const config = { strategy: "save-slot", slot: 0, saveFiles: ["queen.s00"] };
  const scope = {
    skipIntroTarget: "queen",
    scummwebLaunchUrl: new URL("https://scummweb.example/scummvm.html#-x%200%20queen"),
    introCheckpointPath: "/tmp/scummweb-intro",
    ensureDirectory() {},
    buildVersionedAssetUrl: (url) => url,
    FS: {
      writeFile: (path, bytes) => files.set(path, bytes),
      unlink: (path) => files.delete(path),
    },
    fetch: async (url) => url === "games.json"
      ? { ok: true, json: async () => ({ games: [{ target: "queen", skipIntro: config }] }) }
      : { ok: true, arrayBuffer: async () => checkpoint.buffer },
  };
  await runInNewContext("let finishIntroCheckpoint;\n" + template.slice(start, end) + "\nsetupSkipIntroSaves();", scope);
  assert.equal(files.get(playerPath), player);
  assert.equal(scope.__scummwebHasIntroCheckpoint, undefined);
  scope.__scummwebBeginIntroCheckpoint("queen");
  assert.equal(scope.__scummwebHasIntroCheckpoint("queen.s00"), true);
  assert.equal(scope.__scummwebHasIntroCheckpoint("queen.s01"), false);
  scope.__scummwebScanningSaves = true;
  assert.equal(scope.__scummwebHasIntroCheckpoint("queen.s00"), false);
  scope.__scummwebFinishIntroCheckpoint();
  assert.equal(scope.__scummwebHasIntroCheckpoint, undefined);
  assert.equal(scope.__scummwebSkipIntroSeedStatus.finished, true);
  assert.deepEqual([...files], [[playerPath, player]]);
});
