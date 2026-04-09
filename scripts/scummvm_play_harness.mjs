const fs = await import("node:fs");
const path = await import("node:path");
const { fileURLToPath } = await import("node:url");
import { normalizeSkipIntroConfig } from "../app/skip-intro-config.mjs";
import { findGameByTarget, getBundledGameLibrary } from "../lib/catalog.mjs";
import { startHeadlessSession } from "./playwright_headless_repl.mjs";

const bundledGameLibraryData = JSON.parse(
  fs.readFileSync(new URL("../scummvm-shell/games.json", import.meta.url), "utf8"),
);
const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export const defaultBaseUrl = "http://127.0.0.1:3000";
export const defaultHashWidth = 32;
export const defaultHashHeight = 18;
export const defaultSettleIntervalMs = 150;
export const defaultSettleSamples = 2;
export const defaultSettleThreshold = 12;
export const defaultReviewArtifactName = "play-review";
export const defaultExpectThresholds = {
  "any-change": 48,
  "scene-change": 192,
};

function writeArtifactFile(filePath, bytes) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tempFilePath = `${filePath}.tmp`;
  fs.writeFileSync(tempFilePath, bytes);
  fs.renameSync(tempFilePath, filePath);
  return filePath;
}

function sanitizeAssetVersion(rawVersion) {
  return String(rawVersion || "dev").replace(/[^a-zA-Z0-9._-]+/g, "-");
}

function getAssetVersion() {
  const env = globalThis.process?.env || {};

  return sanitizeAssetVersion(
    env.NEXT_PUBLIC_SCUMMVM_ASSET_VERSION ||
      env.SCUMMVM_ASSET_VERSION ||
      env.VERCEL_DEPLOYMENT_ID ||
      env.VERCEL_URL ||
      env.VERCEL_GIT_COMMIT_SHA ||
      "dev",
  );
}

function buildVersionedAssetPath(assetPath, options = {}) {
  if (!assetPath || !assetPath.startsWith("/")) {
    return assetPath;
  }

  const resolved = new URL(assetPath, "https://scummweb.local");
  const searchParams = options.searchParams || {};

  for (const [key, value] of Object.entries(searchParams)) {
    if (value == null) {
      continue;
    }

    resolved.searchParams.delete(key);
    resolved.searchParams.append(key, String(value));
  }

  if (options.hash) {
    resolved.hash = options.hash;
  }

  resolved.searchParams.delete("v");
  resolved.searchParams.append("v", getAssetVersion());
  return `${resolved.pathname}${resolved.search}${resolved.hash}`;
}

function getCanvasLocator(subject) {
  if (!subject || typeof subject.locator !== "function") {
    throw new Error("Expected a Playwright Page or Frame-like subject with locator()");
  }

  return subject.locator("#canvas");
}

async function delayOnCanvas(canvas, delayMs) {
  await canvas.evaluate(
    async (_, timeoutMs) => {
      await new Promise((resolve) => window.setTimeout(resolve, timeoutMs));
    },
    delayMs,
  );
}

async function analyzeCanvas(canvas, options = {}) {
  const {
    brightnessThreshold = 12,
    hashHeight = defaultHashHeight,
    hashWidth = defaultHashWidth,
  } = options;

  return canvas.evaluate(
    (canvasElement, settings) => {
      const sampleWidth = Math.max(1, Math.round(canvasElement.clientWidth || canvasElement.width || 1));
      const sampleHeight = Math.max(1, Math.round(canvasElement.clientHeight || canvasElement.height || 1));
      const scratch = document.createElement("canvas");
      scratch.width = sampleWidth;
      scratch.height = sampleHeight;

      const scratchContext = scratch.getContext("2d", { willReadFrequently: true });

      if (!scratchContext) {
        throw new Error("Unable to create scratch context for ScummVM frame analysis");
      }

      scratchContext.drawImage(canvasElement, 0, 0, sampleWidth, sampleHeight);

      const { data } = scratchContext.getImageData(0, 0, sampleWidth, sampleHeight);
      let left = sampleWidth;
      let top = sampleHeight;
      let right = -1;
      let bottom = -1;

      for (let y = 0; y < sampleHeight; y += 1) {
        for (let x = 0; x < sampleWidth; x += 1) {
          const offset = (y * sampleWidth + x) * 4;
          const alpha = data[offset + 3];

          if (alpha === 0) {
            continue;
          }

          const brightness = data[offset] + data[offset + 1] + data[offset + 2];

          if (brightness <= settings.brightnessThreshold) {
            continue;
          }

          if (x < left) left = x;
          if (x > right) right = x;
          if (y < top) top = y;
          if (y > bottom) bottom = y;
        }
      }

      const activeBounds =
        right >= left && bottom >= top
          ? {
              left,
              top,
              width: right - left + 1,
              height: bottom - top + 1,
            }
          : {
              left: 0,
              top: 0,
              width: sampleWidth,
              height: sampleHeight,
            };

      const hashCanvas = document.createElement("canvas");
      hashCanvas.width = settings.hashWidth;
      hashCanvas.height = settings.hashHeight;

      const hashContext = hashCanvas.getContext("2d", { willReadFrequently: true });

      if (!hashContext) {
        throw new Error("Unable to create hash context for ScummVM frame analysis");
      }

      hashContext.drawImage(
        scratch,
        activeBounds.left,
        activeBounds.top,
        activeBounds.width,
        activeBounds.height,
        0,
        0,
        settings.hashWidth,
        settings.hashHeight,
      );

      const hashData = hashContext.getImageData(0, 0, settings.hashWidth, settings.hashHeight).data;
      const alphabet = "0123456789abcdef";
      let sceneHash = "";

      for (let index = 0; index < hashData.length; index += 4) {
        const grayscale = Math.round(
          hashData[index] * 0.299 + hashData[index + 1] * 0.587 + hashData[index + 2] * 0.114,
        );
        const nibble = Math.max(0, Math.min(15, Math.round(grayscale / 17)));
        sceneHash += alphabet[nibble];
      }

      return {
        activeBounds,
        canvasSize: {
          width: sampleWidth,
          height: sampleHeight,
        },
        sceneHash,
      };
    },
    {
      brightnessThreshold,
      hashHeight,
      hashWidth,
    },
  );
}

export function getPlayGameLibrary(libraryData = bundledGameLibraryData) {
  return getBundledGameLibrary(libraryData, {
    emptyLibraryMessage: "No installed game metadata found in scummvm-shell/games.json",
    normalizeSkipIntro: normalizeSkipIntroConfig,
  });
}

export function getPlayGame(target, options = {}) {
  const library = options.library || getPlayGameLibrary(options.libraryData);
  const game = findGameByTarget(library.games, target);

  if (!game) {
    throw new Error(`Unknown game target: ${target}`);
  }

  return game;
}

export function buildGameLaunchPath({ game, seeded = true, exitTo = null } = {}) {
  if (!game?.target) {
    throw new Error("buildGameLaunchPath requires a game with a target");
  }

  const shouldUseSeed =
    seeded && game.skipIntro?.strategy === "save-slot" && Number.isFinite(Number(game.skipIntro.slot));
  const searchParams = {};

  if (exitTo) {
    searchParams.exitTo = exitTo;
  }

  if (shouldUseSeed) {
    searchParams.skipIntroTarget = game.target;
  }

  return buildVersionedAssetPath("/scummvm.html", {
    hash: shouldUseSeed ? `-x ${game.skipIntro.slot} ${game.target}` : game.target,
    searchParams,
  });
}

export function buildGameLaunchUrl({ baseUrl = defaultBaseUrl, ...options } = {}) {
  return new URL(buildGameLaunchPath(options), baseUrl).toString();
}

export function buildFrameReviewPath({ target, name = defaultReviewArtifactName } = {}) {
  const fileName = `${target || "play"}-${name}.png`;
  return path.join(rootDir, "artifacts", fileName);
}

export async function launchGame(options = {}) {
  const {
    baseUrl = defaultBaseUrl,
    preview = null,
    target,
    timeout = 120000,
    viewport,
    waitUntil = "domcontentloaded",
  } = options;
  const game = getPlayGame(target, options);
  const url = buildGameLaunchUrl({
    baseUrl,
    exitTo: options.exitTo || null,
    game,
    seeded: options.seeded !== false,
  });
  const session = await startHeadlessSession({
    preview,
    timeout,
    url,
    viewport,
    waitUntil,
  });

  await session.page.locator("#canvas").waitFor({ timeout });

  return {
    ...session,
    game,
    target: game.target,
    url,
  };
}

export async function captureFrame(subject, options = {}) {
  const canvas = getCanvasLocator(subject);
  await canvas.waitFor({ timeout: options.timeout ?? 30000 });
  const shouldIncludeScreenshot = options.includeScreenshot !== false || Boolean(options.savePath);

  const [analysis, png] = await Promise.all([
    analyzeCanvas(canvas, options),
    shouldIncludeScreenshot ? canvas.screenshot({ type: "png" }) : Promise.resolve(null),
  ]);

  const savePath = png && options.savePath ? saveCapturedFrame({ png }, options) : null;

  return {
    ...analysis,
    png,
    savePath,
  };
}

export function saveCapturedFrame(frame, options = {}) {
  if (!frame?.png) {
    throw new Error("saveCapturedFrame requires a captured frame with png bytes");
  }

  return writeArtifactFile(
    options.path || options.savePath || buildFrameReviewPath({ target: options.target }),
    frame.png,
  );
}

export async function saveFrameCapture(subject, options = {}) {
  return captureFrame(subject, { ...options, includeScreenshot: true, savePath: options.savePath || options.path });
}

export function compareSceneHashes(leftHash, rightHash) {
  if (typeof leftHash !== "string" || typeof rightHash !== "string" || leftHash.length !== rightHash.length) {
    throw new Error("compareSceneHashes requires equally sized scene-hash strings");
  }

  let difference = 0;

  for (let index = 0; index < leftHash.length; index += 1) {
    difference += Math.abs(parseInt(leftHash[index], 16) - parseInt(rightHash[index], 16));
  }

  return difference;
}

export function verifyChange({ afterHash, beforeHash, expect = "any-change", thresholds = defaultExpectThresholds }) {
  const difference = compareSceneHashes(beforeHash, afterHash);

  if (expect === "no-change-ok") {
    return {
      difference,
      expect,
      minimumDifference: 0,
      ok: true,
    };
  }

  const minimumDifference = thresholds[expect];

  if (!Number.isFinite(minimumDifference)) {
    throw new Error(`Unsupported change expectation: ${expect}`);
  }

  return {
    difference,
    expect,
    minimumDifference,
    ok: difference >= minimumDifference,
  };
}

export async function waitForSettle(subject, options = {}) {
  const canvas = getCanvasLocator(subject);
  const intervalMs = options.intervalMs ?? defaultSettleIntervalMs;
  const maxSamples = options.maxSamples ?? 8;
  const settleSamples = options.settleSamples ?? defaultSettleSamples;
  const settleThreshold = options.settleThreshold ?? defaultSettleThreshold;
  let previous = await captureFrame(subject, { ...options, includeScreenshot: false });
  let stableSampleCount = 0;

  for (let sampleIndex = 0; sampleIndex < maxSamples; sampleIndex += 1) {
    await delayOnCanvas(canvas, intervalMs);
    const current = await captureFrame(subject, { ...options, includeScreenshot: false });
    const difference = compareSceneHashes(previous.sceneHash, current.sceneHash);

    if (difference <= settleThreshold) {
      stableSampleCount += 1;
    } else {
      stableSampleCount = 0;
    }

    if (stableSampleCount >= settleSamples) {
      return {
        ...current,
        settleDifference: difference,
        settled: true,
      };
    }

    previous = current;
  }

  return {
    ...previous,
    settled: false,
  };
}

export async function clickPoint(subject, { button = "left", point } = {}) {
  if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y)) {
    throw new Error("clickPoint requires a finite { x, y } point");
  }

  const canvas = getCanvasLocator(subject);
  await canvas.click({
    button,
    force: true,
    position: point,
  });
}

export async function safeAction(subject, options = {}) {
  const before = await captureFrame(subject, options);
  await clickPoint(subject, options);
  const settled = await waitForSettle(subject, options);
  const after = await captureFrame(subject, options);
  const verification = verifyChange({
    afterHash: after.sceneHash,
    beforeHash: before.sceneHash,
    expect: options.expect ?? "any-change",
    thresholds: options.thresholds,
  });

  return {
    after,
    before,
    ok: verification.ok,
    settled,
    verification,
  };
}
