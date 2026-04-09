const fs = await import("node:fs");
const path = await import("node:path");
const { fileURLToPath } = await import("node:url");
const { chromium } = await import("playwright-core");

const chromeCandidates = [
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/Applications/Chromium.app/Contents/MacOS/Chromium",
];
const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const defaultPeekScreenshotIntervalMs = 2000;
const defaultPeekScreenshotQuality = 65;
const canvasSelector = "#canvas";

function buildDefaultPreviewScreenshotPath() {
  const pid = globalThis.process?.pid ?? "repl";
  const token = `${pid}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  return path.join(rootDir, "artifacts", "previews", `${token}.jpg`);
}

export function findChromeExecutable() {
  const executablePath = chromeCandidates.find((candidate) => fs.existsSync(candidate));

  if (!executablePath) {
    throw new Error("No local Chrome/Chromium installation found for Playwright");
  }

  return executablePath;
}

async function capturePreviewScreenshot(page, { previewScreenshotPath, quality = defaultPeekScreenshotQuality } = {}) {
  if (!previewScreenshotPath || page.isClosed()) {
    return null;
  }

  fs.mkdirSync(path.dirname(previewScreenshotPath), { recursive: true });
  const tempScreenshotPath = `${previewScreenshotPath}.tmp`;

  try {
    const canvas = page.locator(canvasSelector);
    let screenshot = null;

    if ((await canvas.count()) > 0) {
      try {
        screenshot = await canvas.screenshot({
          quality,
          type: "jpeg",
        });
      } catch {
        screenshot = null;
      }
    }

    if (!screenshot) {
      screenshot = await page.screenshot({
        quality,
        type: "jpeg",
      });
    }

    fs.writeFileSync(tempScreenshotPath, screenshot);
    fs.renameSync(tempScreenshotPath, previewScreenshotPath);
    return previewScreenshotPath;
  } catch {
    // Best-effort debug artifact only; callers should not depend on this for gameplay correctness.
    return null;
  }
}

function createPreviewScreenshotWriter({
  browser,
  context,
  page,
  preview,
}) {
  if (!preview) {
    return {
      capture: async () => null,
      path: null,
      stop: async () => {},
    };
  }

  let stopped = false;
  let captureInFlight = null;
  const previewScreenshotPath = preview.path || buildDefaultPreviewScreenshotPath();
  const previewScreenshotIntervalMs = preview.intervalMs ?? defaultPeekScreenshotIntervalMs;
  const previewScreenshotQuality = preview.quality ?? defaultPeekScreenshotQuality;

  const captureScreenshot = async () => {
    if (stopped || page.isClosed() || captureInFlight) {
      return captureInFlight;
    }

    captureInFlight = (async () => {
      try {
        return await capturePreviewScreenshot(page, {
          previewScreenshotPath,
          quality: previewScreenshotQuality,
        });
      } finally {
        captureInFlight = null;
      }
    })();

    return captureInFlight;
  };

  const timer =
    previewScreenshotIntervalMs > 0
      ? setInterval(() => {
          void captureScreenshot();
        }, previewScreenshotIntervalMs)
      : null;
  timer?.unref?.();

  const stop = async () => {
    if (stopped) {
      return;
    }

    stopped = true;
    if (timer) {
      clearInterval(timer);
    }
    await captureInFlight?.catch(() => {});
  };

  const originalContextClose = context.close.bind(context);
  context.close = async (...args) => {
    await stop();
    return originalContextClose(...args);
  };

  const originalBrowserClose = browser.close.bind(browser);
  browser.close = async (...args) => {
    await stop();
    return originalBrowserClose(...args);
  };

  page.once("close", () => {
    void stop();
  });

  return {
    capture: captureScreenshot,
    path: previewScreenshotPath,
    stop,
  };
}

export async function startHeadlessSession(options = {}) {
  const {
    url,
    viewport = { width: 1600, height: 900 },
    waitUntil = "domcontentloaded",
    timeout = 120000,
    preview = null,
  } = options;

  const executablePath = findChromeExecutable();
  const browser = await chromium.launch({
    headless: true,
    executablePath,
  });
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();
  const previewScreenshotWriter = createPreviewScreenshotWriter({
    browser,
    context,
    page,
    preview,
  });

  if (url) {
    await page.goto(url, { waitUntil, timeout });
  }

  await previewScreenshotWriter.capture();

  return {
    browser,
    capturePreviewScreenshot: previewScreenshotWriter.capture,
    context,
    executablePath,
    page,
    previewScreenshotPath: previewScreenshotWriter.path,
    stopPreviewScreenshots: previewScreenshotWriter.stop,
  };
}
