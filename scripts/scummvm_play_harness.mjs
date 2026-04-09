const fs = await import("node:fs");
const path = await import("node:path");
const { fileURLToPath } = await import("node:url");
import { normalizeSkipIntroConfig } from "../app/skip-intro-config.mjs";
import { findGameByTarget, getBundledGameLibrary } from "../lib/catalog.mjs";
import {
  buildRoomKey,
  dedupeHotspotItems,
  defaultCursorDetectionConfidence,
  defaultCursorSearchPadding,
  findRoomHotspot,
  normalizeHotspotFilename,
  normalizeHotspotLabel,
  readRoomHotspotMap,
  runTesseractOcr,
  detectCursorBox,
} from "./scummvm_hotspot_tools.mjs";
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
export const defaultPreviewArtifactName = "play-peek";
export const defaultSettleThreshold = 12;
export const defaultReviewArtifactName = "play-review";
export const defaultRunActionLogName = "actions.log";
export const defaultPlayableStatePollIntervalMs = 250;
export const defaultPlayableStateMinBrightPixels = 48;
export const defaultPrimeInputDelayMs = 150;
export const defaultHoverCaptureDelayMs = 120;
export const defaultHotspotGridSize = 48;
export const defaultHotspotHoverDelayMs = 80;
export const defaultHotspotMinLabelConfidence = 45;
export const defaultHotspotMinContrastPixels = 75;
export const defaultHotspotLabelCropHeight = 72;
export const defaultHotspotLabelCropWidth = 220;
export const defaultHotspotLabelScale = 3;
export const defaultRoomMapsDirName = "room-maps";
export const defaultTargetPointCacheDirName = "target-point-cache";
export const defaultRunScreenshotsDirName = "screenshots";
export const defaultExpectThresholds = {
  "any-change": 48,
  "scene-change": 192,
};
const artifactRunProperty = "__scummwebArtifactRun";

/**
 * @typedef {object} RoomHotspotItem
 * @property {string} label
 * @property {string} normalizedLabel
 * @property {number} ocrConfidence
 * @property {{left: number, top: number, width: number, height: number}} cursorBox
 * @property {{x: number, y: number}} cursorCenter
 * @property {number} cursorConfidence
 * @property {{x: number, y: number}} samplePoint
 * @property {string} screenshotPath
 */

/**
 * @typedef {object} RoomHotspotMap
 * @property {string} target
 * @property {string} roomKey
 * @property {string} sceneHash
 * @property {{left: number, top: number, width: number, height: number}} activeBounds
 * @property {number} gridSize
 * @property {string} generatedAt
 * @property {RoomHotspotItem[]} items
 */

function writeArtifactFile(filePath, bytes) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tempFilePath = `${filePath}.tmp`;
  fs.writeFileSync(tempFilePath, bytes);
  fs.renameSync(tempFilePath, filePath);
  return filePath;
}

function ensureDirectory(directoryPath) {
  fs.mkdirSync(directoryPath, { recursive: true });
  return directoryPath;
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

function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value));
}

function dataUrlToBuffer(dataUrl) {
  const match = String(dataUrl || "").match(/^data:[^;]+;base64,(.+)$/);

  if (!match) {
    throw new Error("Expected a base64 data URL");
  }

  return Buffer.from(match[1], "base64");
}

function buildRoomMapsRoot() {
  return path.join(rootDir, "artifacts", defaultRoomMapsDirName);
}

function buildTargetPointCacheRoot() {
  return path.join(rootDir, "artifacts", defaultTargetPointCacheDirName);
}

function sanitizeRunArtifactName(rawName, fallback = "capture") {
  const normalized = String(rawName || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return normalized || fallback;
}

function getArtifactRun(subject, options = {}) {
  return options.artifactRun || subject?.[artifactRunProperty] || null;
}

function getArtifactRunRoot(options = {}) {
  return options.artifactRun?.root || null;
}

function attachArtifactRun(subject, artifactRun) {
  if (subject && artifactRun) {
    subject[artifactRunProperty] = artifactRun;
  }
}

function normalizeLabelKey(rawLabel) {
  return normalizeHotspotLabel(rawLabel).toLowerCase();
}

function readJsonFile(filePath) {
  if (!filePath || !fs.existsSync(filePath)) {
    return null;
  }

  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeJsonFile(filePath, value) {
  return writeArtifactFile(filePath, Buffer.from(`${JSON.stringify(value, null, 2)}\n`, "utf8"));
}

function buildHotspotGridPoints(activeBounds, gridSize) {
  const points = [];
  const step = Math.max(16, Math.round(gridSize || defaultHotspotGridSize));
  const xStart = activeBounds.left + Math.max(1, Math.round(step / 2));
  const yStart = activeBounds.top + Math.max(1, Math.round(step / 2));
  const xEnd = activeBounds.left + activeBounds.width;
  const yEnd = activeBounds.top + activeBounds.height;

  for (let y = yStart; y < yEnd; y += step) {
    for (let x = xStart; x < xEnd; x += step) {
      points.push({
        x: clamp(Math.round(x), activeBounds.left, xEnd - 1),
        y: clamp(Math.round(y), activeBounds.top, yEnd - 1),
      });
    }
  }

  return points;
}

function buildHotspotScreenshotPath({ artifactRun = null, index = 0, label, roomKey, target } = {}) {
  const roomMapsRoot = artifactRun ? path.join(artifactRun.root, defaultRoomMapsDirName) : buildRoomMapsRoot();
  return path.join(roomMapsRoot, target, roomKey, normalizeHotspotFilename(label, index));
}

export function buildRunActionLogPath({ artifactRun = null } = {}) {
  const artifactRunRoot = getArtifactRunRoot({ artifactRun });

  if (artifactRunRoot) {
    return path.join(artifactRunRoot, defaultRunActionLogName);
  }

  return path.join(rootDir, "artifacts", defaultRunActionLogName);
}

export function buildRunScreenshotPath({ artifactRun = null, label = "capture", startedAt = new Date().toISOString() } = {}) {
  const artifactRunRoot = getArtifactRunRoot({ artifactRun });
  const screenshotsRoot = artifactRunRoot
    ? path.join(artifactRunRoot, defaultRunScreenshotsDirName)
    : path.join(rootDir, "artifacts", defaultRunScreenshotsDirName);
  const token = startedAt.replace(/[:.]/g, "-");
  return path.join(screenshotsRoot, `${token}-${sanitizeRunArtifactName(label)}.png`);
}

function appendArtifactRunAction(artifactRun, action, detail = {}) {
  if (!artifactRun || !action) {
    return null;
  }

  const entry = {
    action,
    at: new Date().toISOString(),
    detail,
  };

  fs.mkdirSync(path.dirname(artifactRun.actionLogPath), { recursive: true });
  fs.appendFileSync(artifactRun.actionLogPath, `${JSON.stringify(entry)}\n`, "utf8");
  return entry;
}

export function buildPlayArtifactRun({ gameId, startedAt = new Date().toISOString() } = {}) {
  if (!gameId) {
    throw new Error("buildPlayArtifactRun requires gameId");
  }

  const root = path.join(rootDir, "artifacts", gameId, startedAt);

  return {
    actionLogPath: path.join(root, defaultRunActionLogName),
    gameId,
    root,
    screenshotsRoot: path.join(root, defaultRunScreenshotsDirName),
    startedAt,
  };
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
      let brightPixelCount = 0;

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

          brightPixelCount += 1;

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
        brightPixelCount,
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

export function buildFrameReviewPath({ artifactRun = null, target, name = defaultReviewArtifactName } = {}) {
  const artifactRunRoot = getArtifactRunRoot({ artifactRun });

  if (artifactRunRoot) {
    return path.join(artifactRunRoot, `${name}.png`);
  }

  const fileName = `${target || "play"}-${name}.png`;
  return path.join(rootDir, "artifacts", fileName);
}

export function buildPreviewScreenshotPath({ artifactRun = null, name = defaultPreviewArtifactName } = {}) {
  const artifactRunRoot = getArtifactRunRoot({ artifactRun });

  if (artifactRunRoot) {
    return path.join(artifactRunRoot, `${name}.jpg`);
  }

  return path.join(rootDir, "artifacts", `${name}.jpg`);
}

export function buildRoomHotspotMapPath({ artifactRun = null, roomKey, target } = {}) {
  if (!target || !roomKey) {
    throw new Error("buildRoomHotspotMapPath requires target and roomKey");
  }

  const artifactRunRoot = getArtifactRunRoot({ artifactRun });
  const roomMapsRoot = artifactRunRoot ? path.join(artifactRunRoot, defaultRoomMapsDirName) : buildRoomMapsRoot();

  return path.join(roomMapsRoot, target, `${roomKey}.json`);
}

export function buildTargetPointCachePath({ roomKey, target } = {}) {
  if (!target || !roomKey) {
    throw new Error("buildTargetPointCachePath requires target and roomKey");
  }

  return path.join(buildTargetPointCacheRoot(), target, `${roomKey}.json`);
}

export function buildCanvasBounds(frame) {
  if (!frame?.canvasSize?.width || !frame?.canvasSize?.height) {
    throw new Error("buildCanvasBounds requires a frame with canvasSize");
  }

  return {
    left: 0,
    top: 0,
    width: frame.canvasSize.width,
    height: frame.canvasSize.height,
  };
}

export function normalizeVisionBox(box, options = {}) {
  if (!box || typeof box !== "object") {
    throw new Error("normalizeVisionBox requires a box object");
  }

  const numeric = (value) => (Number.isFinite(Number(value)) ? Number(value) : null);
  let left = null;
  let top = null;
  let width = null;
  let height = null;

  if (numeric(box.left) !== null && numeric(box.top) !== null && numeric(box.width) !== null && numeric(box.height) !== null) {
    left = numeric(box.left);
    top = numeric(box.top);
    width = numeric(box.width);
    height = numeric(box.height);
  } else if (numeric(box.x) !== null && numeric(box.y) !== null && numeric(box.width) !== null && numeric(box.height) !== null) {
    left = numeric(box.x);
    top = numeric(box.y);
    width = numeric(box.width);
    height = numeric(box.height);
  } else if (
    numeric(box.x1) !== null &&
    numeric(box.y1) !== null &&
    numeric(box.x2) !== null &&
    numeric(box.y2) !== null
  ) {
    const right = numeric(box.x2);
    const bottom = numeric(box.y2);
    left = Math.min(numeric(box.x1), right);
    top = Math.min(numeric(box.y1), bottom);
    width = Math.abs(right - numeric(box.x1));
    height = Math.abs(bottom - numeric(box.y1));
  } else {
    throw new Error("normalizeVisionBox requires left/top/width/height, x/y/width/height, or x1/y1/x2/y2");
  }

  if (!(width > 0) || !(height > 0)) {
    throw new Error("normalizeVisionBox requires a positive width and height");
  }

  const normalized = {
    left,
    top,
    width,
    height,
  };

  const bounds = options.bounds;

  if (!bounds) {
    return normalized;
  }

  const clampedLeft = clamp(normalized.left, bounds.left, bounds.left + bounds.width - 1);
  const clampedTop = clamp(normalized.top, bounds.top, bounds.top + bounds.height - 1);
  const right = clamp(normalized.left + normalized.width, bounds.left + 1, bounds.left + bounds.width);
  const bottom = clamp(normalized.top + normalized.height, bounds.top + 1, bounds.top + bounds.height);

  return {
    left: clampedLeft,
    top: clampedTop,
    width: Math.max(1, right - clampedLeft),
    height: Math.max(1, bottom - clampedTop),
  };
}

export function pointFromBounds(bounds, options = {}) {
  if (!bounds || !Number.isFinite(bounds.left) || !Number.isFinite(bounds.top) || !(bounds.width > 0) || !(bounds.height > 0)) {
    throw new Error("pointFromBounds requires finite bounds with positive width and height");
  }

  const xAlign = clamp(Number.isFinite(Number(options.xAlign)) ? Number(options.xAlign) : 0.5, 0, 1);
  const yAlign = clamp(Number.isFinite(Number(options.yAlign)) ? Number(options.yAlign) : 0.5, 0, 1);
  const inset = Math.max(0, Number(options.inset || 0));
  const usableWidth = Math.max(1, bounds.width - inset * 2);
  const usableHeight = Math.max(1, bounds.height - inset * 2);

  return {
    x: Number((bounds.left + inset + (usableWidth - 1) * xAlign).toFixed(2)),
    y: Number((bounds.top + inset + (usableHeight - 1) * yAlign).toFixed(2)),
  };
}

export function pointFromVisionBox(box, options = {}) {
  return pointFromBounds(normalizeVisionBox(box, options), options);
}

export function resolveCanvasPrimePoint(frame, options = {}) {
  if (!frame?.canvasSize || !frame?.activeBounds) {
    throw new Error("resolveCanvasPrimePoint requires a frame with canvasSize and activeBounds");
  }

  const padding = Math.max(4, Number(options.padding || 8));
  const { activeBounds, canvasSize } = frame;
  const gutters = [
    { left: 0, top: 0, width: canvasSize.width, height: activeBounds.top },
    {
      left: 0,
      top: activeBounds.top + activeBounds.height,
      width: canvasSize.width,
      height: canvasSize.height - (activeBounds.top + activeBounds.height),
    },
    { left: 0, top: activeBounds.top, width: activeBounds.left, height: activeBounds.height },
    {
      left: activeBounds.left + activeBounds.width,
      top: activeBounds.top,
      width: canvasSize.width - (activeBounds.left + activeBounds.width),
      height: activeBounds.height,
    },
  ]
    .filter((candidate) => candidate.width > padding * 2 && candidate.height > padding * 2)
    .sort((leftCandidate, rightCandidate) => rightCandidate.width * rightCandidate.height - leftCandidate.width * leftCandidate.height);

  if (gutters.length === 0) {
    return null;
  }

  return pointFromBounds(gutters[0], { inset: padding });
}

function normalizePreviewConfig(preview, options = {}) {
  if (!preview) {
    return null;
  }

  if (preview === true) {
    return {
      path: buildPreviewScreenshotPath(options),
    };
  }

  return {
    ...preview,
    path: preview.path || buildPreviewScreenshotPath(options),
  };
}

export async function readCanvasUiState(subject, options = {}) {
  const canvas = getCanvasLocator(subject);
  await canvas.waitFor({ timeout: options.timeout ?? 30000 });

  return canvas.evaluate((canvasElement) => {
    const documentRef = canvasElement.ownerDocument;
    const windowRef = documentRef?.defaultView;
    const statusElement = documentRef?.getElementById("status");
    const hintElement = documentRef?.getElementById("scummvm-cursor-grab-hint");
    const statusText = statusElement?.textContent?.trim() || "";
    const statusStyle = statusElement && windowRef ? windowRef.getComputedStyle(statusElement) : null;
    const canvasStyle = windowRef ? windowRef.getComputedStyle(canvasElement) : null;
    const statusVisible = Boolean(
      statusElement &&
        statusStyle &&
        statusStyle.display !== "none" &&
        statusStyle.visibility !== "hidden" &&
        statusText.length > 0,
    );

    return {
      browserCursorVisible: canvasElement.classList.contains("scummvm-browser-cursor-visible"),
      canvasCursor: canvasStyle?.cursor || null,
      hintVisible: Boolean(hintElement?.classList.contains("scummvm-cursor-grab-hint-visible")),
      readyState: windowRef?.__scummwebReadyState || null,
      seedStatus: windowRef?.__scummwebSkipIntroSeedStatus || null,
      statusText,
      statusVisible,
    };
  });
}

function shouldExpectSeededReadyState(options = {}) {
  const game = options.game || (options.target ? getPlayGame(options.target, options) : null);
  return Boolean(options.seeded !== false && game?.skipIntro?.strategy === "save-slot");
}

export async function waitForPlayableState(subject, options = {}) {
  const artifactRun = getArtifactRun(subject, options);
  const canvas = getCanvasLocator(subject);
  const timeout = options.playableTimeout ?? options.timeout ?? 120000;
  const intervalMs = options.intervalMs ?? defaultPlayableStatePollIntervalMs;
  const minBrightPixels = options.minBrightPixels ?? defaultPlayableStateMinBrightPixels;
  const expectedTarget = options.target || options.game?.target || null;
  const expectsSeededState = shouldExpectSeededReadyState(options);
  const deadline = Date.now() + timeout;
  let lastUiState = null;

  while (Date.now() < deadline) {
    lastUiState = await readCanvasUiState(subject, options);
    const readyState = lastUiState.readyState;
    const seedStatus = lastUiState.seedStatus;
    const readyTargetMatches = !expectedTarget || readyState?.target === expectedTarget;
    const seedTargetMatches = !expectedTarget || seedStatus?.target === expectedTarget;
    const readyOk = readyTargetMatches && readyState?.state === "ready";
    const seedOk = !expectsSeededState || (seedTargetMatches && seedStatus?.state === "ready");

    if (readyOk && seedOk && !lastUiState.statusVisible) {
      const settled = await waitForSettle(subject, {
        ...options,
        includeScreenshot: false,
      });
      const frame = await captureFrame(subject, {
        ...options,
        includeScreenshot: true,
      });

      if ((frame.brightPixelCount || 0) >= minBrightPixels) {
        appendArtifactRunAction(artifactRun, "wait-playable-state", {
          brightPixelCount: frame.brightPixelCount,
          readyState,
          roomReady: true,
          seedStatus,
          settled: settled.settled,
          target: expectedTarget,
        });

        return {
          ...lastUiState,
          frame,
          settled,
        };
      }
    }

    await delayOnCanvas(canvas, intervalMs);
  }

  throw new Error(
    `Timed out waiting for a playable ScummVM state${expectedTarget ? ` for ${expectedTarget}` : ""}: ${JSON.stringify(lastUiState)}`,
  );
}

export async function primeCanvasInput(subject, options = {}) {
  const artifactRun = getArtifactRun(subject, options);
  const delayMs = options.delayMs ?? defaultPrimeInputDelayMs;
  const playableState = options.playableState || (await waitForPlayableState(subject, options));
  const frame = options.frame || playableState.frame;
  const point =
    options.point ||
    (options.box ? pointFromVisionBox(options.box, { bounds: buildCanvasBounds(frame) }) : null) ||
    resolveCanvasPrimePoint(frame, options);

  if (!point) {
    throw new Error("primeCanvasInput requires an explicit point or a frame with a safe canvas gutter");
  }

  await hoverPoint(subject, { point });

  if (delayMs > 0) {
    await delayOnCanvas(getCanvasLocator(subject), delayMs);
  }

  const beforeState = await readCanvasUiState(subject, options);
  await clickPoint(subject, { button: options.button || "left", point });

  if (delayMs > 0) {
    await delayOnCanvas(getCanvasLocator(subject), delayMs);
  }

  const afterState = await readCanvasUiState(subject, options);
  appendArtifactRunAction(artifactRun, "prime-canvas-input", {
    afterState,
    beforeState,
    point,
  });

  if (afterState.hintVisible || afterState.browserCursorVisible) {
    throw new Error(`Canvas input was not primed: ${JSON.stringify(afterState)}`);
  }

  return {
    afterState,
    beforeState,
    playableState,
    point,
  };
}

export async function launchGame(options = {}) {
  const {
    baseUrl = defaultBaseUrl,
    playable = true,
    primeInput = false,
    preview = true,
    roomScan = false,
    target,
    timeout = 120000,
    viewport,
    waitUntil = "domcontentloaded",
  } = options;
  const game = getPlayGame(target, options);
  const artifactRun = options.artifactRun || buildPlayArtifactRun({
    gameId: game.gameId || game.target,
    startedAt: options.startedAt || new Date().toISOString(),
  });
  ensureDirectory(artifactRun.root);
  const url = buildGameLaunchUrl({
    baseUrl,
    exitTo: options.exitTo || null,
    game,
    seeded: options.seeded !== false,
  });
  const normalizedPreview = normalizePreviewConfig(preview, { artifactRun });
  const session = await startHeadlessSession({
    preview: normalizedPreview,
    timeout,
    url,
    viewport,
    waitUntil,
  });

  await session.page.locator("#canvas").waitFor({ timeout });
  attachArtifactRun(session.page, artifactRun);
  attachArtifactRun(session.context, artifactRun);
  appendArtifactRunAction(artifactRun, "launch-game", {
    previewPath: session.previewScreenshotPath,
    seeded: options.seeded !== false,
    target: game.target,
    url,
  });

  let playableState = null;
  let primedInput = null;

  if (playable !== false || primeInput !== false) {
    playableState = await waitForPlayableState(session.page, {
      ...options,
      game,
      target: game.target,
    });
  }

  if (primeInput !== false) {
    primedInput = await primeCanvasInput(session.page, {
      ...options,
      game,
      playableState,
      target: game.target,
    });
  }

  let initialRoomScan = null;

  if (roomScan !== false) {
    initialRoomScan = await ensureCurrentRoomHotspotMap(session.page, {
      ...options,
      target: game.target,
    });
  }

  return {
    ...session,
    artifactRun,
    game,
    initialRoomScan,
    playableState,
    primedInput,
    target: game.target,
    url,
  };
}

export async function hoverPoint(subject, { point } = {}) {
  if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y)) {
    throw new Error("hoverPoint requires a finite { x, y } point");
  }

  const canvas = getCanvasLocator(subject);
  await canvas.hover({
    force: true,
    position: point,
  });
  appendArtifactRunAction(getArtifactRun(subject), "hover-point", {
    point,
  });
}

export async function captureFrame(subject, options = {}) {
  const canvas = getCanvasLocator(subject);
  const artifactRun = getArtifactRun(subject, options);
  await canvas.waitFor({ timeout: options.timeout ?? 30000 });
  const shouldIncludeScreenshot = options.includeScreenshot !== false || Boolean(options.savePath);

  const [analysis, png] = await Promise.all([
    analyzeCanvas(canvas, options),
    shouldIncludeScreenshot ? canvas.screenshot({ type: "png" }) : Promise.resolve(null),
  ]);

  const savePath = png && options.savePath ? saveCapturedFrame({ png }, { ...options, artifactRun }) : null;

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

  const savePath = writeArtifactFile(
    options.path || options.savePath || buildFrameReviewPath({ ...options, artifactRun: options.artifactRun || null }),
    frame.png,
  );
  appendArtifactRunAction(options.artifactRun || null, "save-frame-capture", {
    path: savePath,
  });
  return savePath;
}

export async function saveFrameCapture(subject, options = {}) {
  return captureFrame(subject, { ...options, includeScreenshot: true, savePath: options.savePath || options.path });
}

export async function captureAndDescribeFrame(subject, options = {}) {
  const frame = await captureFrame(subject, {
    ...options,
    includeScreenshot: true,
    savePath: options.savePath || options.path,
  });
  const uiState = await readCanvasUiState(subject, options);

  return {
    ...frame,
    uiState,
  };
}

export async function hoverAndCapture(subject, options = {}) {
  const artifactRun = getArtifactRun(subject, options);
  const point =
    options.point ||
    (options.box
      ? pointFromVisionBox(options.box, {
          bounds: options.bounds || (options.beforeFrame ? buildCanvasBounds(options.beforeFrame) : undefined),
        })
      : null);

  if (!point) {
    throw new Error("hoverAndCapture requires a point or box");
  }

  const before =
    options.beforeFrame ||
    (options.captureBefore
      ? await captureAndDescribeFrame(subject, {
          ...options,
          path: options.beforePath,
        })
      : null);
  await hoverPoint(subject, { point });

  if ((options.delayMs ?? defaultHoverCaptureDelayMs) > 0) {
    await delayOnCanvas(getCanvasLocator(subject), options.delayMs ?? defaultHoverCaptureDelayMs);
  }

  const after = await captureAndDescribeFrame(subject, {
    ...options,
    path: options.afterPath || options.path,
  });
  appendArtifactRunAction(artifactRun, "hover-and-capture", {
    box: options.box || null,
    delayMs: options.delayMs ?? defaultHoverCaptureDelayMs,
    point,
  });

  return {
    after,
    before,
    point,
  };
}

export async function calibrateScreenshotTargeting(subject, options = {}) {
  const before =
    options.beforeFrame ||
    (await captureAndDescribeFrame(subject, {
      ...options,
      path: options.beforePath,
    }));
  const bounds = options.bounds || buildCanvasBounds(before);
  const box = options.box ? normalizeVisionBox(options.box, { bounds }) : null;
  const point = options.point || (box ? pointFromVisionBox(box, { bounds }) : null);

  if (!point) {
    throw new Error("calibrateScreenshotTargeting requires a point or box");
  }

  const hover = await hoverAndCapture(subject, {
    ...options,
    afterPath: options.afterPath || options.path,
    beforeFrame: before,
    bounds,
    box,
    captureBefore: false,
    point,
  });

  return {
    after: hover.after,
    before,
    box,
    point,
  };
}

export async function saveRunScreenshot(subject, options = {}) {
  const artifactRun = getArtifactRun(subject, options);
  const surface = options.surface || "canvas";
  const pathOnDisk =
    options.path ||
    buildRunScreenshotPath({
      artifactRun,
      label: options.label || surface,
      startedAt: options.startedAt || new Date().toISOString(),
    });
  let bytes = null;

  if (surface === "canvas") {
    bytes = await getCanvasLocator(subject).screenshot({ type: "png" });
  } else if (subject && typeof subject.screenshot === "function") {
    bytes = await subject.screenshot({
      fullPage: options.fullPage === true,
      type: "png",
    });
  } else {
    throw new Error("saveRunScreenshot with surface='page' requires a Playwright Page-like subject");
  }

  writeArtifactFile(pathOnDisk, bytes);
  appendArtifactRunAction(artifactRun, "save-run-screenshot", {
    path: pathOnDisk,
    surface,
  });
  return pathOnDisk;
}

export async function captureHotspotProbe(subject, options = {}) {
  const canvas = getCanvasLocator(subject);
  const point = options.point;

  if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y)) {
    throw new Error("captureHotspotProbe requires a finite { x, y } point");
  }

  await canvas.waitFor({ timeout: options.timeout ?? 30000 });

  return canvas.evaluate(
    (canvasElement, settings) => {
      const sampleWidth = Math.max(1, Math.round(canvasElement.clientWidth || canvasElement.width || 1));
      const sampleHeight = Math.max(1, Math.round(canvasElement.clientHeight || canvasElement.height || 1));
      const scratch = document.createElement("canvas");
      scratch.width = sampleWidth;
      scratch.height = sampleHeight;
      const scratchContext = scratch.getContext("2d", { willReadFrequently: true });

      if (!scratchContext) {
        throw new Error("Unable to create scratch context for hotspot probing");
      }

      scratchContext.drawImage(canvasElement, 0, 0, sampleWidth, sampleHeight);
      const labelWidth = Math.max(24, Math.min(settings.labelCropWidth, sampleWidth));
      const labelHeight = Math.max(24, Math.min(settings.labelCropHeight, sampleHeight));
      const preferLeft = settings.point.x + settings.labelOffsetX + labelWidth > sampleWidth;
      const labelLeft = preferLeft
        ? Math.max(0, Math.min(sampleWidth - labelWidth, settings.point.x - settings.labelOffsetX - labelWidth))
        : Math.max(0, Math.min(sampleWidth - labelWidth, settings.point.x + settings.labelOffsetX));
      const labelTop = Math.max(0, Math.min(sampleHeight - labelHeight, settings.point.y - Math.round(labelHeight / 2)));
      const labelImage = scratchContext.getImageData(labelLeft, labelTop, labelWidth, labelHeight);
      const workingCanvas = document.createElement("canvas");
      workingCanvas.width = labelWidth;
      workingCanvas.height = labelHeight;
      const workingContext = workingCanvas.getContext("2d", { willReadFrequently: true });

      if (!workingContext) {
        throw new Error("Unable to create working context for hotspot probing");
      }

      workingContext.putImageData(labelImage, 0, 0);
      const workingImage = workingContext.getImageData(0, 0, labelWidth, labelHeight);
      const workingData = workingImage.data;
      let contrastPixels = 0;
      let hash = "";
      const alphabet = "0123456789abcdef";

      for (let index = 0; index < workingData.length; index += 4) {
        const grayscale = Math.round(
          workingData[index] * 0.299 + workingData[index + 1] * 0.587 + workingData[index + 2] * 0.114,
        );
        const threshold = grayscale >= settings.labelThreshold ? 255 : 0;
        workingData[index] = threshold;
        workingData[index + 1] = threshold;
        workingData[index + 2] = threshold;
        workingData[index + 3] = 255;

        if (threshold === 255) {
          contrastPixels += 1;
        }

        if ((index / 4) % 4 === 0) {
          hash += alphabet[Math.max(0, Math.min(15, Math.round(grayscale / 17)))];
        }
      }

      workingContext.putImageData(workingImage, 0, 0);
      const scaledCanvas = document.createElement("canvas");
      scaledCanvas.width = labelWidth * settings.labelScale;
      scaledCanvas.height = labelHeight * settings.labelScale;
      const scaledContext = scaledCanvas.getContext("2d");

      if (!scaledContext) {
        throw new Error("Unable to create scaled context for hotspot probing");
      }

      scaledContext.imageSmoothingEnabled = false;
      scaledContext.fillStyle = "#000";
      scaledContext.fillRect(0, 0, scaledCanvas.width, scaledCanvas.height);
      scaledContext.drawImage(workingCanvas, 0, 0, scaledCanvas.width, scaledCanvas.height);

      const cursorPadding = settings.cursorPadding;
      const cursorLeft = Math.max(0, Math.min(sampleWidth - 1, settings.point.x - cursorPadding));
      const cursorTop = Math.max(0, Math.min(sampleHeight - 1, settings.point.y - cursorPadding));
      const cursorWidth = Math.max(
        1,
        Math.min(sampleWidth - cursorLeft, Math.min(cursorPadding * 2 + 1, sampleWidth)),
      );
      const cursorHeight = Math.max(
        1,
        Math.min(sampleHeight - cursorTop, Math.min(cursorPadding * 2 + 1, sampleHeight)),
      );
      const cursorImage = scratchContext.getImageData(cursorLeft, cursorTop, cursorWidth, cursorHeight);

      return {
        cursorSample: {
          data: Array.from(cursorImage.data),
          height: cursorHeight,
          left: cursorLeft,
          top: cursorTop,
          width: cursorWidth,
        },
        labelBounds: {
          height: labelHeight,
          left: labelLeft,
          top: labelTop,
          width: labelWidth,
        },
        labelContrastPixels: contrastPixels,
        labelHash: hash,
        labelImageDataUrl: scaledCanvas.toDataURL("image/png"),
      };
    },
    {
      cursorPadding: options.cursorPadding ?? defaultCursorSearchPadding,
      labelCropHeight: options.labelCropHeight ?? defaultHotspotLabelCropHeight,
      labelCropWidth: options.labelCropWidth ?? defaultHotspotLabelCropWidth,
      labelOffsetX: options.labelOffsetX ?? 18,
      labelScale: options.labelScale ?? defaultHotspotLabelScale,
      labelThreshold: options.labelThreshold ?? 180,
      point,
    },
  );
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
  appendArtifactRunAction(getArtifactRun(subject), "click-point", {
    button,
    point,
  });
}

export async function getCurrentRoomState(subject, options = {}) {
  const frame = options.frame || (await waitForSettle(subject, { ...options, includeScreenshot: false }));
  const target = options.target;

  if (!target) {
    throw new Error("getCurrentRoomState requires target");
  }

  return {
    ...frame,
    roomKey: buildRoomKey({
      activeBounds: frame.activeBounds,
      sceneHash: frame.sceneHash,
      target,
    }),
    target,
  };
}

export function loadRoomHotspotMap({ artifactRun = null, roomKey, target } = {}) {
  return readRoomHotspotMap(buildRoomHotspotMapPath({ artifactRun, roomKey, target }));
}

export function saveRoomHotspotMap({ artifactRun = null, map, roomKey, target } = {}) {
  if (!map || !target || !roomKey) {
    throw new Error("saveRoomHotspotMap requires map, target, and roomKey");
  }

  const mapPath = buildRoomHotspotMapPath({ artifactRun, roomKey, target });
  writeArtifactFile(mapPath, Buffer.from(`${JSON.stringify(map, null, 2)}\n`, "utf8"));
  appendArtifactRunAction(artifactRun, "save-room-hotspot-map", {
    itemCount: map.items?.length ?? 0,
    path: mapPath,
    roomKey,
    target,
  });
  return mapPath;
}

export function loadTargetPointCache({ roomKey, target } = {}) {
  return readJsonFile(buildTargetPointCachePath({ roomKey, target }));
}

export function saveTargetPointCache({ cache, roomKey, target } = {}) {
  if (!cache || !roomKey || !target) {
    throw new Error("saveTargetPointCache requires cache, roomKey, and target");
  }

  const cachePath = buildTargetPointCachePath({ roomKey, target });
  writeJsonFile(cachePath, cache);
  return cachePath;
}

export async function findCachedTargetPoint(subject, options = {}) {
  const roomState = options.roomState || (await getCurrentRoomState(subject, options));
  const cache = loadTargetPointCache({
    roomKey: roomState.roomKey,
    target: options.target,
  });
  const normalizedLabel = normalizeLabelKey(options.label);

  if (!normalizedLabel || !Array.isArray(cache?.items)) {
    return null;
  }

  const entry = cache.items.find((item) => item.normalizedLabel === normalizedLabel);
  return entry ? { ...entry.point } : null;
}

export async function saveCachedTargetPoint(subject, options = {}) {
  const artifactRun = getArtifactRun(subject, options);
  const roomState = options.roomState || (await getCurrentRoomState(subject, options));
  const normalizedLabel = normalizeLabelKey(options.label);

  if (!normalizedLabel) {
    throw new Error("saveCachedTargetPoint requires a non-empty label");
  }

  if (!options.point || !Number.isFinite(options.point.x) || !Number.isFinite(options.point.y)) {
    throw new Error("saveCachedTargetPoint requires a finite point");
  }

  const existingCache =
    loadTargetPointCache({
      roomKey: roomState.roomKey,
      target: options.target,
    }) || {
      items: [],
      roomKey: roomState.roomKey,
      target: options.target,
      updatedAt: null,
    };

  const nextEntry = {
    label: options.label,
    normalizedLabel,
    point: {
      x: Number(options.point.x.toFixed(2)),
      y: Number(options.point.y.toFixed(2)),
    },
    updatedAt: new Date().toISOString(),
  };
  const existingIndex = existingCache.items.findIndex((item) => item.normalizedLabel === normalizedLabel);

  if (existingIndex === -1) {
    existingCache.items.push(nextEntry);
  } else {
    existingCache.items[existingIndex] = nextEntry;
  }

  existingCache.updatedAt = nextEntry.updatedAt;
  const cachePath = saveTargetPointCache({
    cache: existingCache,
    roomKey: roomState.roomKey,
    target: options.target,
  });
  appendArtifactRunAction(artifactRun, "save-target-point-cache", {
    label: options.label,
    path: cachePath,
    point: nextEntry.point,
    roomKey: roomState.roomKey,
    target: options.target,
  });

  return nextEntry.point;
}

export async function dropCachedTargetPoint(subject, options = {}) {
  const artifactRun = getArtifactRun(subject, options);
  const roomState = options.roomState || (await getCurrentRoomState(subject, options));
  const normalizedLabel = normalizeLabelKey(options.label);
  const cache = loadTargetPointCache({
    roomKey: roomState.roomKey,
    target: options.target,
  });

  if (!normalizedLabel || !Array.isArray(cache?.items)) {
    return false;
  }

  const nextItems = cache.items.filter((item) => item.normalizedLabel !== normalizedLabel);

  if (nextItems.length === cache.items.length) {
    return false;
  }

  if (nextItems.length === 0) {
    const cachePath = buildTargetPointCachePath({
      roomKey: roomState.roomKey,
      target: options.target,
    });
    fs.rmSync(cachePath, { force: true });
    appendArtifactRunAction(artifactRun, "drop-target-point-cache", {
      label: options.label,
      path: cachePath,
      removed: true,
      roomKey: roomState.roomKey,
      target: options.target,
    });
    return true;
  }

  cache.items = nextItems;
  cache.updatedAt = new Date().toISOString();
  const cachePath = saveTargetPointCache({
    cache,
    roomKey: roomState.roomKey,
    target: options.target,
  });
  appendArtifactRunAction(artifactRun, "drop-target-point-cache", {
    label: options.label,
    path: cachePath,
    removed: true,
    roomKey: roomState.roomKey,
    target: options.target,
  });
  return true;
}

export async function discoverRoomHotspots(subject, options = {}) {
  const roomState = await getCurrentRoomState(subject, options);
  const roomKey = options.roomKey || roomState.roomKey;
  const artifactRun = getArtifactRun(subject, options);
  const gridSize = options.gridSize ?? defaultHotspotGridSize;
  const minLabelConfidence = options.minLabelConfidence ?? defaultHotspotMinLabelConfidence;
  const points = buildHotspotGridPoints(roomState.activeBounds, gridSize);
  const seenHashes = new Set();
  let items = [];
  appendArtifactRunAction(artifactRun, "discover-room-hotspots-start", {
    gridSize,
    roomKey,
    target: options.target,
  });

  for (const point of points) {
    await hoverPoint(subject, { point });

    if ((options.hoverDelayMs ?? defaultHotspotHoverDelayMs) > 0) {
      await delayOnCanvas(getCanvasLocator(subject), options.hoverDelayMs ?? defaultHotspotHoverDelayMs);
    }

    const probe = await captureHotspotProbe(subject, { ...options, point });

    if (probe.labelContrastPixels < (options.minContrastPixels ?? defaultHotspotMinContrastPixels)) {
      continue;
    }

    if (seenHashes.has(probe.labelHash)) {
      continue;
    }

    seenHashes.add(probe.labelHash);
    const ocrResult = runTesseractOcr({
      imageBuffer: dataUrlToBuffer(probe.labelImageDataUrl),
      imageExtension: "png",
      psm: options.psm ?? 7,
      whitelist: options.whitelist,
      workingDirectory: options.ocrWorkingDirectory,
    });

    if (!ocrResult.ok || ocrResult.confidence < minLabelConfidence) {
      continue;
    }

    const cursorMatch = detectCursorBox(probe.cursorSample, {
      minConfidence: options.minCursorConfidence ?? defaultCursorDetectionConfidence,
      offset: {
        left: probe.cursorSample.left,
        top: probe.cursorSample.top,
      },
      probePoint: {
        x: point.x - probe.cursorSample.left,
        y: point.y - probe.cursorSample.top,
      },
    });

    if (!cursorMatch) {
      continue;
    }

    const frame = await captureFrame(subject, { includeScreenshot: true, timeout: options.timeout });
    const candidate = {
      cursorBox: cursorMatch.cursorBox,
      cursorCenter: cursorMatch.cursorCenter,
      cursorConfidence: cursorMatch.confidence,
      label: ocrResult.label,
      normalizedLabel: normalizeHotspotLabel(ocrResult.normalizedLabel || ocrResult.label),
      ocrConfidence: Number(ocrResult.confidence.toFixed(2)),
      png: frame.png,
      samplePoint: point,
      screenshotPath: "",
    };

    items = dedupeHotspotItems(items, candidate, {
      duplicateDistance: options.duplicateDistance,
    });
  }

  const screenshotCounts = new Map();
  const persistedItems = items.map((item) => {
    const index = screenshotCounts.get(item.normalizedLabel) || 0;
    const screenshotPath = buildHotspotScreenshotPath({
      artifactRun,
      index,
      label: item.normalizedLabel,
      roomKey,
      target: options.target,
    });
    screenshotCounts.set(item.normalizedLabel, index + 1);
    writeArtifactFile(screenshotPath, item.png);
    const { png, ...persistedItem } = item;

    return {
      ...persistedItem,
      screenshotPath,
    };
  });

  appendArtifactRunAction(artifactRun, "discover-room-hotspots-complete", {
    itemCount: persistedItems.length,
    roomKey,
    target: options.target,
  });

  return {
    activeBounds: roomState.activeBounds,
    generatedAt: new Date().toISOString(),
    gridSize,
    items: persistedItems,
    roomKey,
    sceneHash: roomState.sceneHash,
    target: options.target,
  };
}

export async function ensureCurrentRoomHotspotMap(subject, options = {}) {
  const roomState = await getCurrentRoomState(subject, options);
  const artifactRun = getArtifactRun(subject, options);
  let map = loadRoomHotspotMap({
    artifactRun,
    roomKey: roomState.roomKey,
    target: options.target,
  });
  const changed = Boolean(options.previousRoomKey) && options.previousRoomKey !== roomState.roomKey;
  let created = false;

  if (!map) {
    map = await discoverRoomHotspots(subject, {
      ...options,
      frame: roomState,
      roomKey: roomState.roomKey,
    });
    saveRoomHotspotMap({
      artifactRun,
      map,
      roomKey: roomState.roomKey,
      target: options.target,
    });
    created = true;
  }

  appendArtifactRunAction(artifactRun, "ensure-room-hotspot-map", {
    changed,
    created,
    itemCount: map?.items?.length ?? 0,
    roomKey: roomState.roomKey,
    target: options.target,
  });

  return {
    changed,
    created,
    map,
    roomKey: roomState.roomKey,
  };
}

export async function findHotspotPoint(subject, options = {}) {
  const currentRoom = await ensureCurrentRoomHotspotMap(subject, options);
  const hotspot = findRoomHotspot(currentRoom.map, options.label);

  return hotspot ? { ...hotspot.cursorCenter } : null;
}

export async function verifyProof(subject, options = {}) {
  const proof = options.proof ?? options.expect ?? "any-change";

  if (typeof proof === "function") {
    const result = await proof({
      after: options.after,
      before: options.before,
      settled: options.settled,
      subject,
    });

    return typeof result === "boolean" ? { kind: "callback", ok: result } : { kind: "callback", ...result };
  }

  if (proof && typeof proof.evaluate === "function") {
    const result = await proof.evaluate({
      after: options.after,
      before: options.before,
      settled: options.settled,
      subject,
    });

    return typeof result === "boolean" ? { kind: proof.type || "callback", ok: result } : { kind: proof.type || "callback", ...result };
  }

  const normalizedProof = typeof proof === "string" ? { type: proof } : proof || { type: "any-change" };

  if (normalizedProof.type === "repeat-once-if-no-change") {
    return {
      expect: normalizedProof.expect || "any-change",
      kind: normalizedProof.type,
      ok: false,
      repeatOnNoChangeOnce: true,
    };
  }

  if (!["any-change", "scene-change", "no-change-ok"].includes(normalizedProof.type)) {
    throw new Error(`Unsupported proof type: ${normalizedProof.type}`);
  }

  return {
    kind: normalizedProof.type,
    ...verifyChange({
      afterHash: options.after.sceneHash,
      beforeHash: options.before.sceneHash,
      expect: normalizedProof.type,
      thresholds: normalizedProof.thresholds || options.thresholds,
    }),
  };
}

export async function clickAndVerify(subject, options = {}) {
  const artifactRun = getArtifactRun(subject, options);
  const before = options.before || (await captureFrame(subject, options));
  await clickPoint(subject, options);
  let settled = await waitForSettle(subject, options);
  let after = await captureFrame(subject, options);
  let verification = await verifyProof(subject, {
    ...options,
    after,
    before,
    settled,
  });
  let repeated = false;

  if (!verification.ok && verification.repeatOnNoChangeOnce) {
    repeated = true;
    await clickPoint(subject, options);
    settled = await waitForSettle(subject, options);
    after = await captureFrame(subject, options);
    verification = await verifyProof(subject, {
      ...options,
      after,
      before,
      settled,
      proof: verification.expect || options.proof,
    });
  }

  appendArtifactRunAction(artifactRun, "click-and-verify", {
    button: options.button || "left",
    ok: verification.ok,
    point: options.point,
    proof: typeof options.proof === "string" ? options.proof : options.proof?.type || options.expect || "any-change",
    repeated,
  });

  return {
    after,
    before,
    ok: verification.ok,
    repeated,
    settled,
    verification,
  };
}

export async function safeAction(subject, options = {}) {
  const artifactRun = getArtifactRun(subject, options);
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

  appendArtifactRunAction(artifactRun, "safe-action", {
    button: options.button || "left",
    difference: verification.difference,
    expect: verification.expect,
    ok: verification.ok,
    point: options.point,
  });

  return {
    after,
    before,
    ok: verification.ok,
    settled,
    verification,
  };
}
