import assert from "node:assert/strict";
import test from "node:test";
import { buildSkipIntroLaunchSrc, normalizeSkipIntroConfig } from "../app/skip-intro-config.mjs";

test("normalizes save-slot skip-intro configs", () => {
  assert.deepEqual(
    normalizeSkipIntroConfig({
      strategy: "save-slot",
      durationMinutes: 2,
      slot: 0,
      saveFiles: ["SKY-VM.000", "SKY-VM.000"],
    }),
    {
      strategy: "save-slot",
      durationMinutes: 2,
      slot: 0,
      saveFiles: ["SKY-VM.000"],
    }
  );
});

test("infers save-slot configs when slot metadata is present", () => {
  assert.deepEqual(
    normalizeSkipIntroConfig({
      durationMinutes: 2,
      slot: 0,
      saveFiles: ["queen.s00"],
    }),
    {
      strategy: "save-slot",
      durationMinutes: 2,
      slot: 0,
      saveFiles: ["queen.s00"],
    }
  );
});

test("rejects legacy keypress skip-intro configs", () => {
  assert.equal(
    normalizeSkipIntroConfig({
      strategy: "keypress",
      durationMinutes: 2,
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
      durationMinutes: 2,
      slot: 2,
      saveFiles: [],
    }),
    null
  );
});

test("catalog intro checkpoints match their rebuild overrides and ship intact", async () => {
  const { readFile, readdir } = await import("node:fs/promises");
  const { createHash } = await import("node:crypto");
  const shell = new URL("../scummvm-shell/", import.meta.url);
  const library = JSON.parse(await readFile(new URL("games.json", shell), "utf8"));
  const overrides = JSON.parse(await readFile(new URL("../launcher-game-overrides.json", import.meta.url), "utf8"));
  const manifest = JSON.parse(await readFile(new URL("runtime-assets.json", shell), "utf8"));
  // The Zork games begin at the prompt. The new graphical editions use
  // their original intros and have no separately verified checkpoints.
  const withoutCheckpoints = new Set([
    "draci", "atlantis-demo", "grim-demo", "monkey4-demo", "comi-demo", "zork1", "zork2", "zork3",
  ]);
  assert.ok(library.games.every((game) => withoutCheckpoints.has(game.target) || normalizeSkipIntroConfig(game.skipIntro)),
    "bundled editions with checkpoints must retain a verified intro-skip strategy");
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

test("normalizes a native intro skip without requiring or inventing a save slot", () => {
  assert.deepEqual(normalizeSkipIntroConfig({ strategy: "boot-param", bootParam: 1, durationMinutes: 5 }),
    { strategy: "boot-param", bootParam: 1, durationMinutes: 5 });
  for (const bootParam of [0, -1, 1.5, "invalid", Infinity]) {
    assert.equal(normalizeSkipIntroConfig({ strategy: "boot-param", bootParam, durationMinutes: 5 }), null);
  }
});

test("native intro launches preserve file handoff and exit routes without seeding saves", () => {
  const result = new URL(buildSkipIntroLaunchSrc(
    "/scummvm.html?localGame=1&catalogGame=nippon&exitTo=%2Fnippon-safes-inc&skipIntroTarget=nippon-amiga#nippon-amiga",
    "nippon-amiga", { strategy: "boot-param", bootParam: 1, durationMinutes: 5 }, "https://example.test"), "https://example.test");
  assert.equal(result.searchParams.get("localGame"), "1");
  assert.equal(result.searchParams.get("catalogGame"), "nippon");
  assert.equal(result.searchParams.get("exitTo"), "/nippon-safes-inc");
  assert.equal(result.searchParams.has("skipIntroTarget"), false);
  assert.equal(decodeURIComponent(result.hash), "#-b 1 nippon-amiga");
});

test("save checkpoint launches keep their native slot and seed target", () => {
  const result = new URL(buildSkipIntroLaunchSrc("/scummvm.html?localGame=1#soltys", "soltys",
    { strategy: "save-slot", slot: 1, saveFiles: ["soltys.001"], durationMinutes: 2 }, "https://example.test"), "https://example.test");
  assert.equal(result.searchParams.get("skipIntroTarget"), "soltys");
  assert.equal(result.searchParams.get("localGame"), "1");
  assert.equal(decodeURIComponent(result.hash), "#-x 1 soltys");
});
