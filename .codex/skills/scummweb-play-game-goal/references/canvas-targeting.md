# ScummVM Canvas Targeting

Use this before any hotspot work in `scummweb`.

## Root Cause To Avoid

The browser `#canvas` usually fills the viewport, but the active game frame often does not.
ScummVM can render a smaller scene inside black bars or padded margins.
If you mix:

- outer-page viewport coordinates
- raw canvas CSS pixels
- logical game coordinates from a walkthrough
- screenshot-relative pixels from a fresh image

you can miss a hotspot by a large margin even when the target looks visually obvious.

## Safe Rules

- Stay in one coordinate space per step.
- If you choose a point from a fresh `locator("#canvas").screenshot()`, reuse that same pixel directly in `locator.click({ position })` or `locator.hover({ position })`.
- If you start from logical game coordinates, first compute the active rendered frame inside the canvas, then map logical coordinates into that active frame.
- Prefer `locator.click({ position })` and `locator.hover({ position })` over `page.mouse` calls when targeting exact hotspots.
- After any unexplained miss, re-snapshot and re-check the coordinate space before clicking again.

## Minimal Helper Snippet

```javascript
const { startHeadlessSession } = await import(
  "/Users/tsilva/repos/tsilva/scummweb/scripts/playwright_headless_repl.mjs"
);
const { createRequire } = await import("node:module");
const require = createRequire("/Users/tsilva/repos/tsilva/scummweb/scripts/playwright_headless_repl.mjs");
const sharp = require("sharp");
var browser;
var context;
var page;

({ browser, context, page } = await startHeadlessSession({ url: TARGET_URL }));

async function captureCanvasState(canvas = page.locator("#canvas")) {
  const png = await canvas.screenshot({ type: "png" });
  const { data, info } = await sharp(png).raw().toBuffer({ resolveWithObject: true });
  let left = info.width;
  let top = info.height;
  let right = -1;
  let bottom = -1;

  for (let y = 0; y < info.height; y += 1) {
    for (let x = 0; x < info.width; x += 1) {
      const offset = (y * info.width + x) * info.channels;
      const r = data[offset];
      const g = data[offset + 1];
      const b = data[offset + 2];
      const a = info.channels > 3 ? data[offset + 3] : 255;
      const brightness = r + g + b;

      if (a === 0 || brightness <= 12) continue;

      if (x < left) left = x;
      if (x > right) right = x;
      if (y < top) top = y;
      if (y > bottom) bottom = y;
    }
  }

  return {
    png,
    screenshotSize: { width: info.width, height: info.height },
    activeBounds: {
      left,
      top,
      width: right - left + 1,
      height: bottom - top + 1,
    },
  };
}

function mapLogicalPoint(activeBounds, point, logicalSize) {
  return {
    x: activeBounds.left + (point.x / logicalSize.width) * activeBounds.width,
    y: activeBounds.top + (point.y / logicalSize.height) * activeBounds.height,
  };
}

async function clickScreenshotPoint(point, options = {}, canvas = page.locator("#canvas")) {
  await canvas.click({ position: point, force: true, ...options });
}

async function clickLogicalPoint(point, logicalSize, options = {}, canvas = page.locator("#canvas")) {
  const { activeBounds } = await captureCanvasState(canvas);
  await canvas.click({
    position: mapLogicalPoint(activeBounds, point, logicalSize),
    force: true,
    ...options,
  });
}
```

## Practical Choice Rule

- If you are targeting from what you can see in a current screenshot, use screenshot pixels directly.
- If you are targeting from a walkthrough, prior notes, or reusable coordinates, map through `activeBounds` first.
- If you only need to refine a nearby point, use short local adjustments after a fresh screenshot rather than restarting a wide sweep.
