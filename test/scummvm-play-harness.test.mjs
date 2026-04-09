import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  buildFrameReviewPath,
  buildGameLaunchPath,
  buildGameLaunchUrl,
  buildPreviewScreenshotPath,
  buildRoomHotspotMapPath,
  compareSceneHashes,
  getPlayGame,
  getPlayGameLibrary,
  loadRoomHotspotMap,
  saveCapturedFrame,
  saveRoomHotspotMap,
  verifyChange,
} from "../scripts/scummvm_play_harness.mjs";
import {
  buildRoomKey,
  dedupeHotspotItems,
  normalizeHotspotFilename,
  normalizeHotspotLabel,
} from "../scripts/scummvm_hotspot_tools.mjs";

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
  assert.equal(buildPreviewScreenshotPath().endsWith(path.join("artifacts", "play-peek.jpg")), true);
  assert.equal(saveCapturedFrame({ png }, { path: savePath, target: "sky" }), savePath);
  assert.deepEqual(fs.readFileSync(savePath), png);
});

test("play harness builds stable room keys from scene hashes and active bounds", () => {
  const roomKey = buildRoomKey({
    activeBounds: {
      left: 32,
      top: 48,
      width: 640,
      height: 360,
    },
    sceneHash: "abcdef123456",
    target: "sky",
  });

  assert.equal(roomKey, "sky-abcdef123456-32x48x640x360");
});

test("play harness normalizes hotspot labels and screenshot filenames", () => {
  assert.equal(normalizeHotspotLabel("  Rung!!!  "), "Rung");
  assert.equal(normalizeHotspotFilename("North Door / Exit"), "north-door-exit.png");
  assert.equal(normalizeHotspotFilename("North Door / Exit", 1), "north-door-exit-2.png");
});

test("play harness deduplicates hotspot hits by label and nearby coordinates", () => {
  const items = dedupeHotspotItems(
    dedupeHotspotItems([], {
      cursorCenter: { x: 101, y: 202 },
      cursorConfidence: 0.5,
      label: "Rung",
      normalizedLabel: "Rung",
      ocrConfidence: 60,
    }),
    {
      cursorCenter: { x: 108, y: 206 },
      cursorConfidence: 0.8,
      label: "Rung",
      normalizedLabel: "Rung",
      ocrConfidence: 80,
    },
  );

  assert.equal(items.length, 1);
  assert.equal(items[0].ocrConfidence, 80);
  assert.equal(items[0].cursorConfidence, 0.8);
});

test("play harness saves and loads room hotspot maps", () => {
  const roomKey = `test-room-${Date.now()}`;
  const target = "test-fixture";
  const map = {
    activeBounds: { left: 0, top: 0, width: 320, height: 200 },
    generatedAt: "2026-04-09T12:00:00.000Z",
    gridSize: 48,
    items: [
      {
        cursorBox: { left: 10, top: 20, width: 16, height: 16 },
        cursorCenter: { x: 18, y: 28 },
        label: "Rung",
        normalizedLabel: "Rung",
        ocrConfidence: 88,
        samplePoint: { x: 18, y: 28 },
        screenshotPath: "/tmp/rung.png",
      },
    ],
    roomKey,
    sceneHash: "abc123",
    target,
  };
  const mapPath = buildRoomHotspotMapPath({ roomKey, target });

  try {
    saveRoomHotspotMap({ map, roomKey, target });
    assert.deepEqual(loadRoomHotspotMap({ roomKey, target }), map);
  } finally {
    fs.rmSync(path.dirname(mapPath), { force: true, recursive: true });
  }
});
