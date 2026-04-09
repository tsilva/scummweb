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
var browser;
var context;
var game;
var page;
var target = "sky";

const { captureFrame, launchGame } = await import(
  "/Users/tsilva/repos/tsilva/scummweb/scripts/scummvm_play_harness.mjs"
);

({ browser, context, game, page, target } = await launchGame({ target }));

async function captureCanvasState(canvas = page.locator("#canvas")) {
  const frame = await captureFrame(page);

  return {
    png: frame.png,
    screenshotSize: frame.canvasSize,
    activeBounds: frame.activeBounds,
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
