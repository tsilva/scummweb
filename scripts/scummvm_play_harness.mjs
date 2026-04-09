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
export const defaultHotspotGridSize = 48;
export const defaultHotspotHoverDelayMs = 80;
export const defaultHotspotMinLabelConfidence = 45;
export const defaultHotspotMinContrastPixels = 75;
export const defaultHotspotLabelCropHeight = 72;
export const defaultHotspotLabelCropWidth = 220;
export const defaultHotspotLabelScale = 3;
export const defaultRoomMapsDirName = "room-maps";
export const defaultExpectThresholds = {
  "any-change": 48,
  "scene-change": 192,
};

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

function buildHotspotScreenshotPath(target, roomKey, label, index = 0) {
  return path.join(buildRoomMapsRoot(), target, roomKey, normalizeHotspotFilename(label, index));
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

export function buildPreviewScreenshotPath({ name = defaultPreviewArtifactName } = {}) {
  return path.join(rootDir, "artifacts", `${name}.jpg`);
}

export function buildRoomHotspotMapPath({ roomKey, target } = {}) {
  if (!target || !roomKey) {
    throw new Error("buildRoomHotspotMapPath requires target and roomKey");
  }

  return path.join(buildRoomMapsRoot(), target, `${roomKey}.json`);
}

function normalizePreviewConfig(preview) {
  if (!preview) {
    return null;
  }

  if (preview === true) {
    return {
      path: buildPreviewScreenshotPath(),
    };
  }

  return {
    ...preview,
    path: preview.path || buildPreviewScreenshotPath(),
  };
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
  const normalizedPreview = normalizePreviewConfig(preview);
  const session = await startHeadlessSession({
    preview: normalizedPreview,
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

export async function hoverPoint(subject, { point } = {}) {
  if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y)) {
    throw new Error("hoverPoint requires a finite { x, y } point");
  }

  const canvas = getCanvasLocator(subject);
  await canvas.hover({
    force: true,
    position: point,
  });
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

export function loadRoomHotspotMap({ roomKey, target } = {}) {
  return readRoomHotspotMap(buildRoomHotspotMapPath({ roomKey, target }));
}

export function saveRoomHotspotMap({ map, roomKey, target } = {}) {
  if (!map || !target || !roomKey) {
    throw new Error("saveRoomHotspotMap requires map, target, and roomKey");
  }

  const mapPath = buildRoomHotspotMapPath({ roomKey, target });
  writeArtifactFile(mapPath, Buffer.from(`${JSON.stringify(map, null, 2)}\n`, "utf8"));
  return mapPath;
}

export async function discoverRoomHotspots(subject, options = {}) {
  const roomState = await getCurrentRoomState(subject, options);
  const roomKey = options.roomKey || roomState.roomKey;
  const gridSize = options.gridSize ?? defaultHotspotGridSize;
  const minLabelConfidence = options.minLabelConfidence ?? defaultHotspotMinLabelConfidence;
  const points = buildHotspotGridPoints(roomState.activeBounds, gridSize);
  const seenHashes = new Set();
  let items = [];

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
    const screenshotPath = buildHotspotScreenshotPath(options.target, roomKey, item.normalizedLabel, index);
    screenshotCounts.set(item.normalizedLabel, index + 1);
    writeArtifactFile(screenshotPath, item.png);
    const { png, ...persistedItem } = item;

    return {
      ...persistedItem,
      screenshotPath,
    };
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
  let map = loadRoomHotspotMap({
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
      map,
      roomKey: roomState.roomKey,
      target: options.target,
    });
    created = true;
  }

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
