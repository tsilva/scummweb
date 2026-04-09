import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  buildFrameReviewPath,
  buildGameLaunchPath,
  buildGameLaunchUrl,
  compareSceneHashes,
  getPlayGame,
  getPlayGameLibrary,
  saveCapturedFrame,
  verifyChange,
} from "../scripts/scummvm_play_harness.mjs";

test("play harness normalizes library metadata and finds games by target", () => {
  const library = getPlayGameLibrary({
    primaryTarget: "queen",
    games: [
      {
        target: "queen",
        title: "Flight of the Amazon Queen",
        skipIntro: {
          durationMinutes: 2,
          slot: 0,
          saveFiles: ["queen.s00", "queen.s00"],
        },
      },
    ],
  });

  assert.equal(library.primaryTarget, "queen");
  assert.equal(library.games[0].slug, "flight-of-the-amazon-queen");
  assert.deepEqual(library.games[0].skipIntro, {
    strategy: "save-slot",
    durationMinutes: 2,
    slot: 0,
    saveFiles: ["queen.s00"],
  });
  assert.equal(getPlayGame("queen", { library }).displayTitle, "Flight of the Amazon Queen");
});

test("play harness builds seeded and unseeded launch paths", () => {
  const game = {
    target: "sky",
    skipIntro: {
      strategy: "save-slot",
      durationMinutes: 2,
      slot: 0,
      saveFiles: ["SKY-VM.000"],
    },
  };

  const seededUrl = new URL(buildGameLaunchUrl({ baseUrl: "http://127.0.0.1:3000", game }));
  const unseededPath = buildGameLaunchPath({ game, seeded: false });
  const unseededUrl = new URL(unseededPath, "http://127.0.0.1:3000");

  assert.equal(seededUrl.pathname, "/scummvm.html");
  assert.equal(seededUrl.searchParams.get("skipIntroTarget"), "sky");
  assert.equal(seededUrl.searchParams.get("v"), "dev");
  assert.equal(decodeURIComponent(seededUrl.hash.slice(1)), "-x 0 sky");

  assert.equal(unseededUrl.pathname, "/scummvm.html");
  assert.equal(unseededUrl.searchParams.get("skipIntroTarget"), null);
  assert.equal(unseededUrl.searchParams.get("v"), "dev");
  assert.equal(decodeURIComponent(unseededUrl.hash.slice(1)), "sky");
});

test("play harness compares hashes and verifies visible change thresholds", () => {
  const noChangeHash = "0".repeat(32);
  const lightChangeHash = `1${"0".repeat(31)}`;
  const heavyChangeHash = "f".repeat(32);

  assert.equal(compareSceneHashes(noChangeHash, noChangeHash), 0);
  assert.equal(compareSceneHashes(noChangeHash, lightChangeHash), 1);

  assert.deepEqual(
    verifyChange({ beforeHash: noChangeHash, afterHash: noChangeHash, expect: "no-change-ok" }),
    {
      difference: 0,
      expect: "no-change-ok",
      minimumDifference: 0,
      ok: true,
    },
  );

  assert.equal(
    verifyChange({ beforeHash: noChangeHash, afterHash: lightChangeHash, expect: "any-change" }).ok,
    false,
  );
  assert.equal(
    verifyChange({ beforeHash: noChangeHash, afterHash: heavyChangeHash, expect: "any-change" }).ok,
    true,
  );
  assert.equal(
    verifyChange({ beforeHash: noChangeHash, afterHash: heavyChangeHash, expect: "scene-change" }).ok,
    true,
  );
});

test("play harness saves review artifacts without changing capture semantics", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "scummweb-play-harness-"));
  const savePath = path.join(tempDir, "review.png");
  const png = Buffer.from("not-a-real-png-but-fine-for-write-tests");

  assert.equal(buildFrameReviewPath({ target: "sky" }).endsWith(path.join("artifacts", "sky-play-review.png")), true);
  assert.equal(saveCapturedFrame({ png }, { path: savePath, target: "sky" }), savePath);
  assert.deepEqual(fs.readFileSync(savePath), png);
});
