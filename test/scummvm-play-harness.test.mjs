import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  buildCanvasBounds,
  buildPlayArtifactRun,
  buildFrameReviewPath,
  buildGameLaunchPath,
  buildGameLaunchUrl,
  buildPreviewScreenshotPath,
  buildRunActionLogPath,
  buildRunScreenshotPath,
  buildRoomHotspotMapPath,
  buildTargetPointCachePath,
  compareSceneHashes,
  getPlayGame,
  getPlayGameLibrary,
  loadTargetPointCache,
  loadRoomHotspotMap,
  normalizeVisionBox,
  pointFromVisionBox,
  resolveCanvasPrimePoint,
  saveCapturedFrame,
  saveTargetPointCache,
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
  const artifactRun = buildPlayArtifactRun({
    gameId: "sky",
    startedAt: "2026-04-09T12:34:56.789Z",
  });

  assert.equal(buildFrameReviewPath({ target: "sky" }).endsWith(path.join("artifacts", "sky-play-review.png")), true);
  assert.equal(buildPreviewScreenshotPath().endsWith(path.join("artifacts", "play-peek.jpg")), true);
  assert.equal(saveCapturedFrame({ png }, { path: savePath, target: "sky" }), savePath);
  assert.equal(
    saveCapturedFrame({ png }, { artifactRun, target: "sky" }).endsWith(
      path.join("artifacts", "sky", "2026-04-09T12:34:56.789Z", "play-review.png"),
    ),
    true,
  );
  assert.deepEqual(fs.readFileSync(savePath), png);
  const logEntries = fs
    .readFileSync(artifactRun.actionLogPath, "utf8")
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line));
  assert.equal(logEntries.at(-1)?.action, "save-frame-capture");
  fs.rmSync(artifactRun.root, { force: true, recursive: true });
});

test("play harness builds per-run artifact roots using game id and ISO timestamp", () => {
  const artifactRun = buildPlayArtifactRun({
    gameId: "sky",
    startedAt: "2026-04-09T12:34:56.789Z",
  });

  assert.equal(artifactRun.gameId, "sky");
  assert.equal(artifactRun.startedAt, "2026-04-09T12:34:56.789Z");
  assert.equal(
    artifactRun.root.endsWith(path.join("artifacts", "sky", "2026-04-09T12:34:56.789Z")),
    true,
  );
  assert.equal(
    buildFrameReviewPath({ artifactRun, target: "sky" }).endsWith(
      path.join("artifacts", "sky", "2026-04-09T12:34:56.789Z", "play-review.png"),
    ),
    true,
  );
  assert.equal(
    buildPreviewScreenshotPath({ artifactRun }).endsWith(
      path.join("artifacts", "sky", "2026-04-09T12:34:56.789Z", "play-peek.jpg"),
    ),
    true,
  );
  assert.equal(
    buildRoomHotspotMapPath({ artifactRun, roomKey: "room-1", target: "sky" }).endsWith(
      path.join("artifacts", "sky", "2026-04-09T12:34:56.789Z", "room-maps", "sky", "room-1.json"),
    ),
    true,
  );
  assert.equal(
    buildRunActionLogPath({ artifactRun }).endsWith(
      path.join("artifacts", "sky", "2026-04-09T12:34:56.789Z", "actions.log"),
    ),
    true,
  );
  assert.equal(
    buildRunScreenshotPath({ artifactRun, label: "checkpoint", startedAt: "2026-04-09T12:35:00.000Z" }).endsWith(
      path.join("artifacts", "sky", "2026-04-09T12:34:56.789Z", "screenshots", "2026-04-09T12-35-00-000Z-checkpoint.png"),
    ),
    true,
  );
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

test("play harness normalizes multimodal vision boxes and derives a point inside them", () => {
  const frame = {
    activeBounds: { left: 100, top: 80, width: 600, height: 360 },
    canvasSize: { width: 1280, height: 720 },
  };
  const bounds = buildCanvasBounds(frame);
  const box = normalizeVisionBox(
    {
      x1: 240,
      y1: 160,
      x2: 360,
      y2: 260,
    },
    { bounds },
  );

  assert.deepEqual(box, {
    left: 240,
    top: 160,
    width: 120,
    height: 100,
  });
  assert.deepEqual(pointFromVisionBox(box), {
    x: 299.5,
    y: 209.5,
  });
});

test("play harness resolves a safe prime point from canvas gutters", () => {
  const point = resolveCanvasPrimePoint({
    activeBounds: { left: 140, top: 100, width: 900, height: 520 },
    canvasSize: { width: 1280, height: 720 },
  });

  assert.ok(point);
  assert.ok(point.x < 140 || point.x > 1040 || point.y < 100 || point.y > 620);
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

test("play harness saves and loads cached target points by room", () => {
  const roomKey = `vision-room-${Date.now()}`;
  const target = "vision-fixture";
  const cache = {
    items: [
      {
        label: "Rung",
        normalizedLabel: "rung",
        point: { x: 123.5, y: 456.25 },
        updatedAt: "2026-04-09T12:00:00.000Z",
      },
    ],
    roomKey,
    target,
    updatedAt: "2026-04-09T12:00:00.000Z",
  };
  const cachePath = buildTargetPointCachePath({ roomKey, target });

  try {
    saveTargetPointCache({ cache, roomKey, target });
    assert.deepEqual(loadTargetPointCache({ roomKey, target }), cache);
  } finally {
    fs.rmSync(path.dirname(cachePath), { force: true, recursive: true });
  }
});

test("play harness saves and loads room hotspot maps", () => {
  const roomKey = `test-room-${Date.now()}`;
  const target = "test-fixture";
  const artifactRun = buildPlayArtifactRun({
    gameId: target,
    startedAt: "2026-04-09T12:34:56.789Z",
  });
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
  const mapPath = buildRoomHotspotMapPath({ artifactRun, roomKey, target });

  try {
    saveRoomHotspotMap({ artifactRun, map, roomKey, target });
    assert.deepEqual(loadRoomHotspotMap({ artifactRun, roomKey, target }), map);
    const logEntries = fs
      .readFileSync(artifactRun.actionLogPath, "utf8")
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line));
    assert.equal(logEntries.at(-1)?.action, "save-room-hotspot-map");
  } finally {
    fs.rmSync(path.dirname(mapPath), { force: true, recursive: true });
  }
});
