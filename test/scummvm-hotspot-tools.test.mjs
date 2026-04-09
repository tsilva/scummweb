import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { chromium } from "playwright-core";
import { findChromeExecutable } from "../scripts/playwright_headless_repl.mjs";
import { detectCursorBox, normalizeHotspotLabel, runTesseractOcr } from "../scripts/scummvm_hotspot_tools.mjs";

function createSyntheticCursorSample() {
  const width = 64;
  const height = 64;
  const data = new Uint8ClampedArray(width * height * 4);
  const center = { x: 20, y: 22 };

  for (let index = 0; index < data.length; index += 4) {
    data[index] = 40;
    data[index + 1] = 40;
    data[index + 2] = 40;
    data[index + 3] = 255;
  }

  for (let delta = -8; delta <= 8; delta += 1) {
    for (let outline = -1; outline <= 1; outline += 1) {
      const horizontalX = center.x + delta;
      const horizontalY = center.y + outline;
      const verticalX = center.x + outline;
      const verticalY = center.y + delta;

      if (horizontalX >= 0 && horizontalX < width && horizontalY >= 0 && horizontalY < height) {
        const offset = (horizontalY * width + horizontalX) * 4;
        const color = outline === 0 ? 255 : 0;
        data[offset] = color;
        data[offset + 1] = color;
        data[offset + 2] = color;
      }

      if (verticalX >= 0 && verticalX < width && verticalY >= 0 && verticalY < height) {
        const offset = (verticalY * width + verticalX) * 4;
        const color = outline === 0 ? 255 : 0;
        data[offset] = color;
        data[offset + 1] = color;
        data[offset + 2] = color;
      }
    }
  }

  return {
    data,
    height,
    width,
  };
}

async function renderLabelScreenshot(text, style = "") {
  const browser = await chromium.launch({
    executablePath: findChromeExecutable(),
    headless: true,
  });
  const context = await browser.newContext({
    viewport: {
      height: 220,
      width: 480,
    },
  });
  const page = await context.newPage();

  try {
    await page.setContent(`
      <style>
        html, body {
          align-items: center;
          background: #000;
          display: flex;
          justify-content: center;
          margin: 0;
          min-height: 100%;
        }

        #label {
          color: #fff;
          font: 700 48px/1.1 "Trebuchet MS", Verdana, sans-serif;
          letter-spacing: 0.02em;
          ${style}
        }
      </style>
      <div id="label">${text}</div>
    `);

    return await page.locator("#label").screenshot({ type: "png" });
  } finally {
    await context.close();
    await browser.close();
  }
}

const hasChrome = (() => {
  try {
    findChromeExecutable();
    return true;
  } catch {
    return false;
  }
})();

test("cursor detection finds a cursor box near the probe point", () => {
  const sample = createSyntheticCursorSample();
  const result = detectCursorBox(sample, {
    minConfidence: 0.2,
    probePoint: { x: 20, y: 22 },
  });

  assert.ok(result);
  assert.equal(Math.round(result.cursorCenter.x), 20);
  assert.equal(Math.round(result.cursorCenter.y), 22);
  assert.ok(result.confidence >= 0.2);
});

test("cursor detection rejects low-confidence samples", () => {
  const width = 32;
  const height = 32;
  const data = new Uint8ClampedArray(width * height * 4);

  for (let index = 0; index < data.length; index += 4) {
    data[index] = 80;
    data[index + 1] = 80;
    data[index + 2] = 80;
    data[index + 3] = 255;
  }

  assert.equal(
    detectCursorBox(
      {
        data,
        height,
        width,
      },
      {
        probePoint: { x: 16, y: 16 },
      },
    ),
    null,
  );
});

test(
  "ocr reads hotspot labels like Rung",
  { skip: !hasChrome ? "Chrome is required for OCR fixture rendering" : false },
  async () => {
    const imageBuffer = await renderLabelScreenshot("Rung");
    const result = runTesseractOcr({
      imageBuffer,
      imageExtension: "png",
      workingDirectory: path.join(os.tmpdir(), `scummweb-hotspot-ocr-${Date.now()}`),
    });

    assert.equal(normalizeHotspotLabel(result.label).toLowerCase(), "rung");
    assert.ok(result.confidence > 0);
  },
);

test(
  "ocr rejects blank or unreadable labels",
  { skip: !hasChrome ? "Chrome is required for OCR fixture rendering" : false },
  async () => {
    const imageBuffer = await renderLabelScreenshot(" ", "min-width: 160px; min-height: 64px;");
    const result = runTesseractOcr({
      imageBuffer,
      imageExtension: "png",
      minConfidence: 80,
      workingDirectory: path.join(os.tmpdir(), `scummweb-hotspot-ocr-empty-${Date.now()}`),
    });

    assert.equal(result.ok, false);
    assert.ok(result.confidence < 80 || result.normalizedLabel === "");
  },
);
