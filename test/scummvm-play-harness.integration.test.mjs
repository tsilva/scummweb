import assert from "node:assert/strict";
import test from "node:test";
import { calibrateScreenshotTargeting, launchGame } from "../scripts/scummvm_play_harness.mjs";

const shouldRunIntegration = process.env.SCUMMWEB_RUN_INTEGRATION === "1";
const baseUrl = process.env.SCUMMWEB_BASE_URL || "";

test(
  "seeded sky launch waits for a playable state without running room discovery by default",
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
      assert.equal(session.initialRoomScan, null);
      assert.ok(session.playableState);
      assert.equal(session.playableState.readyState?.state, "ready");
      assert.equal(session.playableState.seedStatus?.state, "ready");
      assert.ok(session.playableState.frame.brightPixelCount >= 48);
      assert.ok(session.playableState.frame.png);

      const calibration = await calibrateScreenshotTargeting(session.page, {
        beforeFrame: session.playableState.frame,
        point: {
          x: 12,
          y: 12,
        },
      });

      assert.equal(calibration.point.x, 12);
      assert.equal(calibration.point.y, 12);
      assert.ok(calibration.after.png);
    } finally {
      await session.context.close();
      await session.browser.close();
    }
  },
);
