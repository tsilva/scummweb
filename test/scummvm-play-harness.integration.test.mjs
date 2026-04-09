import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { ensureCurrentRoomHotspotMap, launchGame, saveFrameCapture } from "../scripts/scummvm_play_harness.mjs";

const shouldRunIntegration = process.env.SCUMMWEB_RUN_INTEGRATION === "1";
const baseUrl = process.env.SCUMMWEB_BASE_URL || "";

async function waitForSeededFrame(page, timeoutMs = 240000) {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const state = await page.locator("#canvas").evaluate(() => ({
      seedStatus: globalThis.__scummwebSkipIntroSeedStatus || null,
      statusText: document.getElementById("status")?.textContent || null,
    }));

    if (state.seedStatus?.state === "ready" && !state.statusText) {
      await page.waitForTimeout(30000);
      const frame = await saveFrameCapture(page, {
        path: "./artifacts/integration-seeded-frame.png",
        target: "sky",
      });

      if (frame.activeBounds.width > 0 && frame.activeBounds.height > 0) {
        return frame;
      }
    }

    await page.waitForTimeout(500);
  }

  throw new Error("Timed out waiting for a seeded gameplay frame");
}

test(
  "seeded sky room discovery records at least one labeled hotspot",
  {
    skip:
      !shouldRunIntegration || !baseUrl
        ? "Set SCUMMWEB_RUN_INTEGRATION=1 and SCUMMWEB_BASE_URL=http://127.0.0.1:<port> to run this test"
        : false,
    timeout: 360000,
  },
  async () => {
    const session = await launchGame({
      baseUrl,
      seeded: true,
      target: "sky",
      timeout: 240000,
    });

    try {
      await waitForSeededFrame(session.page, 240000);
      const result = await ensureCurrentRoomHotspotMap(session.page, {
        gridSize: 56,
        hoverDelayMs: 120,
        minContrastPixels: 45,
        minCursorConfidence: 0.2,
        minLabelConfidence: 15,
        target: "sky",
        timeout: 60000,
      });

      assert.ok(result.map.items.length >= 1);
      assert.ok(fs.existsSync(result.map.items[0].screenshotPath));
      assert.equal(typeof result.map.roomKey, "string");
      assert.ok(result.map.roomKey.startsWith("sky-"));
    } finally {
      await session.context.close();
      await session.browser.close();
    }
  },
);
