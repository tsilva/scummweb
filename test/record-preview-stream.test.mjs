import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  buildFfmpegArgs,
  computeFrameDigest,
  createPreviewStreamRecorder,
  parseArgs,
} from "../scripts/record_preview_stream.mjs";

function writeAtomically(filePath, contents) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tempPath = `${filePath}.tmp`;
  fs.writeFileSync(tempPath, contents);
  fs.renameSync(tempPath, filePath);
}

async function waitFor(assertion, { intervalMs = 20, timeoutMs = 2000 } = {}) {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() <= deadline) {
    try {
      const value = await assertion();

      if (value) {
        return value;
      }
    } catch {}

    await new Promise((resolve) => {
      setTimeout(resolve, intervalMs);
    });
  }

  throw new Error("Timed out waiting for condition");
}

test("preview recorder parses CLI args and ffmpeg settings", () => {
  const defaults = parseArgs([]);
  assert.equal(defaults.ffmpegPath, "ffmpeg");
  assert.equal(defaults.fps, 1);
  assert.equal(defaults.inputPath.endsWith(path.join("artifacts", "play-peek.jpg")), true);
  assert.equal(defaults.outputPath.endsWith(path.join("artifacts", "play-peek.ts")), true);
  assert.equal(defaults.pollMs, 250);

  assert.deepEqual(parseArgs(["--input", "artifacts/custom.jpg", "--output", "artifacts/custom.ts", "--fps", "4"]), {
    ffmpegPath: "ffmpeg",
    fps: 4,
    inputPath: "artifacts/custom.jpg",
    outputPath: "artifacts/custom.ts",
    pollMs: 250,
  });

  assert.match(computeFrameDigest(Buffer.from("frame-a")), /^[a-f0-9]{64}$/);
  assert.deepEqual(buildFfmpegArgs({ fps: 2, outputPath: "artifacts/play-peek.ts" }).slice(-2), [
    "mpegts",
    "artifacts/play-peek.ts",
  ]);
});

test("preview recorder appends only distinct frames and handles missing initial files", async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "scummweb-preview-recorder-"));
  const inputPath = path.join(tempDir, "play-peek.jpg");
  const outputPath = path.join(tempDir, "play-peek.ts");
  const writes = [];
  let closed = false;
  let openCalls = 0;
  let openTarget = null;

  const recorder = createPreviewStreamRecorder({
    createEncoder() {
      return {
        async close() {
          closed = true;
        },
        async writeFrame(bytes) {
          writes.push(Buffer.from(bytes).toString("utf8"));
        },
      };
    },
    createHttpServer() {
      return {
        async start() {
          return {
            url: "http://127.0.0.1:43210/play-peek.ts",
          };
        },
        async stop() {},
      };
    },
    inputPath,
    openInVlc: async ({ target }) => {
      openCalls += 1;
      openTarget = target;
      return true;
    },
    outputPath,
    pollMs: 25,
  });

  await recorder.start();
  writeAtomically(inputPath, "frame-a");
  await waitFor(() => writes.length === 1);

  writeAtomically(inputPath, "frame-a");
  await new Promise((resolve) => {
    setTimeout(resolve, 150);
  });
  assert.deepEqual(writes, ["frame-a"]);

  writeAtomically(inputPath, "frame-b");
  await waitFor(() => writes.length === 2);

  await recorder.stop();

  assert.deepEqual(writes, ["frame-a", "frame-b"]);
  assert.equal(closed, true);
  assert.equal(openCalls, 1);
  assert.equal(openTarget, "http://127.0.0.1:43210/play-peek.ts");
});
