const fs = await import("node:fs");
const os = await import("node:os");
const path = await import("node:path");
const { spawnSync } = await import("node:child_process");
const { createHash } = await import("node:crypto");

export const defaultCursorDetectionConfidence = 0.45;
export const defaultCursorDistanceThreshold = 18;
export const defaultCursorSearchPadding = 28;
export const defaultHotspotDuplicateDistance = 16;
export const defaultHotspotLabelWhitelist =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789' -";

function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value));
}

function pixelOffset(width, x, y) {
  return (y * width + x) * 4;
}

function computeBrightness(data, width, x, y) {
  const offset = pixelOffset(width, x, y);
  return (data[offset] + data[offset + 1] + data[offset + 2]) / 3;
}

function buildHotspotFilenameBase(label) {
  return normalizeHotspotLabel(label)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function parseTesseractTsv(tsvText) {
  const lines = String(tsvText || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length <= 1) {
    return [];
  }

  const headers = lines[0].split("\t");
  return lines.slice(1).map((line) => {
    const values = line.split("\t");
    const entry = {};

    for (let index = 0; index < headers.length; index += 1) {
      entry[headers[index]] = values[index] ?? "";
    }

    return entry;
  });
}

function scoreCursorCluster(cluster, probePoint, options = {}) {
  const minPixelCount = options.minPixelCount ?? 12;
  const maxPixelCount = options.maxPixelCount ?? 600;
  const minDimension = options.minDimension ?? 6;
  const maxDimension = options.maxDimension ?? 40;
  const maxProbeDistance = options.maxProbeDistance ?? defaultCursorDistanceThreshold;
  const width = cluster.right - cluster.left + 1;
  const height = cluster.bottom - cluster.top + 1;
  const center = {
    x: cluster.left + (width - 1) / 2,
    y: cluster.top + (height - 1) / 2,
  };
  const distance = Math.hypot(center.x - probePoint.x, center.y - probePoint.y);
  const containsProbe =
    probePoint.x >= cluster.left - 2 &&
    probePoint.x <= cluster.right + 2 &&
    probePoint.y >= cluster.top - 2 &&
    probePoint.y <= cluster.bottom + 2;
  const pixelScore = clamp((cluster.pixelCount - minPixelCount) / Math.max(1, maxPixelCount - minPixelCount), 0, 1);
  const dimensionScore =
    width >= minDimension && width <= maxDimension && height >= minDimension && height <= maxDimension ? 1 : 0;
  const distanceScore = clamp(1 - distance / Math.max(1, maxProbeDistance), 0, 1);
  const contrastScore = cluster.darkPixels > 0 && cluster.lightPixels > 0 ? 1 : 0;

  return {
    bbox: {
      left: cluster.left,
      top: cluster.top,
      width,
      height,
    },
    center,
    confidence:
      (containsProbe ? 0.3 : 0) + distanceScore * 0.35 + dimensionScore * 0.15 + contrastScore * 0.1 + pixelScore * 0.1,
    distance,
  };
}

export function normalizeHotspotLabel(rawLabel) {
  return String(rawLabel || "")
    .replace(/\s+/g, " ")
    .replace(/[^\p{L}\p{N}' -]+/gu, " ")
    .trim();
}

export function normalizeHotspotFilename(label, index = 0) {
  const base = buildHotspotFilenameBase(label) || "hotspot";
  return index > 0 ? `${base}-${index + 1}.png` : `${base}.png`;
}

export function buildRoomKey({ activeBounds, sceneHash, target }) {
  if (!target || !sceneHash || !activeBounds) {
    throw new Error("buildRoomKey requires target, sceneHash, and activeBounds");
  }

  const { left, top, width, height } = activeBounds;
  const compactSceneHash =
    sceneHash.length > 32 ? createHash("sha1").update(sceneHash).digest("hex").slice(0, 16) : sceneHash;
  return `${target}-${compactSceneHash}-${left}x${top}x${width}x${height}`;
}

export function dedupeHotspotItems(items, candidate, options = {}) {
  const duplicateDistance = options.duplicateDistance ?? defaultHotspotDuplicateDistance;
  const nextItems = Array.isArray(items) ? [...items] : [];
  const candidatePoint = candidate?.cursorCenter;

  if (!candidate?.normalizedLabel || !candidatePoint) {
    return nextItems;
  }

  const existingIndex = nextItems.findIndex((entry) => {
    if (entry.normalizedLabel !== candidate.normalizedLabel || !entry.cursorCenter) {
      return false;
    }

    return (
      Math.hypot(entry.cursorCenter.x - candidatePoint.x, entry.cursorCenter.y - candidatePoint.y) <= duplicateDistance
    );
  });

  if (existingIndex === -1) {
    nextItems.push(candidate);
    return nextItems;
  }

  const existing = nextItems[existingIndex];
  const existingScore = (existing.ocrConfidence || 0) + (existing.cursorConfidence || 0);
  const candidateScore = (candidate.ocrConfidence || 0) + (candidate.cursorConfidence || 0);

  if (candidateScore > existingScore) {
    nextItems[existingIndex] = candidate;
  }

  return nextItems;
}

export function findRoomHotspot(map, label) {
  const normalizedLabel = normalizeHotspotLabel(label).toLowerCase();

  if (!normalizedLabel || !Array.isArray(map?.items)) {
    return null;
  }

  return (
    map.items.find((entry) => entry.normalizedLabel.toLowerCase() === normalizedLabel) ||
    map.items.find((entry) => normalizeHotspotLabel(entry.label).toLowerCase() === normalizedLabel) ||
    null
  );
}

export function detectCursorBox(rawSample, options = {}) {
  const width = Number(rawSample?.width || 0);
  const height = Number(rawSample?.height || 0);
  const data =
    rawSample?.data instanceof Uint8ClampedArray
      ? rawSample.data
      : rawSample?.data instanceof Uint8Array
        ? new Uint8ClampedArray(rawSample.data)
        : Array.isArray(rawSample?.data)
          ? Uint8ClampedArray.from(rawSample.data)
          : null;

  if (!width || !height || !data || data.length !== width * height * 4) {
    return null;
  }

  const probePoint = options.probePoint || {
    x: width / 2,
    y: height / 2,
  };
  const visited = new Uint8Array(width * height);
  const candidateMask = new Uint8Array(width * height);

  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const offset = pixelOffset(width, x, y);
      const alpha = data[offset + 3];

      if (alpha <= 0) {
        continue;
      }

      const brightness = computeBrightness(data, width, x, y);
      const left = computeBrightness(data, width, x - 1, y);
      const right = computeBrightness(data, width, x + 1, y);
      const top = computeBrightness(data, width, x, y - 1);
      const bottom = computeBrightness(data, width, x, y + 1);
      const localContrast = Math.max(
        Math.abs(brightness - left),
        Math.abs(brightness - right),
        Math.abs(brightness - top),
        Math.abs(brightness - bottom),
      );

      if (localContrast < 70) {
        continue;
      }

      if (brightness >= 225 || brightness <= 45) {
        candidateMask[y * width + x] = 1;
      }
    }
  }

  const clusters = [];

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = y * width + x;

      if (!candidateMask[index] || visited[index]) {
        continue;
      }

      const queue = [[x, y]];
      visited[index] = 1;
      const cluster = {
        bottom: y,
        darkPixels: 0,
        left: x,
        lightPixels: 0,
        pixelCount: 0,
        right: x,
        top: y,
      };

      while (queue.length > 0) {
        const [currentX, currentY] = queue.pop();
        const currentIndex = currentY * width + currentX;

        if (!candidateMask[currentIndex]) {
          continue;
        }

        const brightness = computeBrightness(data, width, currentX, currentY);
        cluster.pixelCount += 1;
        cluster.left = Math.min(cluster.left, currentX);
        cluster.right = Math.max(cluster.right, currentX);
        cluster.top = Math.min(cluster.top, currentY);
        cluster.bottom = Math.max(cluster.bottom, currentY);

        if (brightness >= 225) {
          cluster.lightPixels += 1;
        }

        if (brightness <= 45) {
          cluster.darkPixels += 1;
        }

        for (let offsetY = -1; offsetY <= 1; offsetY += 1) {
          for (let offsetX = -1; offsetX <= 1; offsetX += 1) {
            const nextX = currentX + offsetX;
            const nextY = currentY + offsetY;

            if (nextX < 0 || nextY < 0 || nextX >= width || nextY >= height) {
              continue;
            }

            const nextIndex = nextY * width + nextX;

            if (!visited[nextIndex] && candidateMask[nextIndex]) {
              visited[nextIndex] = 1;
              queue.push([nextX, nextY]);
            }
          }
        }
      }

      clusters.push(cluster);
    }
  }

  const offset = options.offset || { left: 0, top: 0 };
  const bestMatch = clusters
    .map((cluster) => scoreCursorCluster(cluster, probePoint, options))
    .sort((leftEntry, rightEntry) => rightEntry.confidence - leftEntry.confidence)[0];

  if (!bestMatch || bestMatch.confidence < (options.minConfidence ?? defaultCursorDetectionConfidence)) {
    return null;
  }

  return {
    confidence: bestMatch.confidence,
    cursorBox: {
      left: bestMatch.bbox.left + offset.left,
      top: bestMatch.bbox.top + offset.top,
      width: bestMatch.bbox.width,
      height: bestMatch.bbox.height,
    },
    cursorCenter: {
      x: Number((bestMatch.center.x + offset.left).toFixed(2)),
      y: Number((bestMatch.center.y + offset.top).toFixed(2)),
    },
  };
}

export function readRoomHotspotMap(mapPath) {
  if (!mapPath || !fs.existsSync(mapPath)) {
    return null;
  }

  return JSON.parse(fs.readFileSync(mapPath, "utf8"));
}

export function runTesseractOcr(options = {}) {
  const workingDirectory = options.workingDirectory || fs.mkdtempSync(path.join(os.tmpdir(), "scummweb-ocr-"));
  const cleanupDirectory = !options.workingDirectory;
  const imagePath =
    options.imagePath ||
    path.join(workingDirectory, `ocr-input.${String(options.imageExtension || "png").replace(/[^a-z0-9]+/gi, "")}`);

  try {
    fs.mkdirSync(workingDirectory, { recursive: true });

    if (!options.imagePath) {
      if (!options.imageBuffer) {
        throw new Error("runTesseractOcr requires imagePath or imageBuffer");
      }

      fs.mkdirSync(path.dirname(imagePath), { recursive: true });
      fs.writeFileSync(imagePath, options.imageBuffer);
    }

    const args = [
      imagePath,
      "stdout",
      "--psm",
      String(options.psm ?? 7),
      "-l",
      options.language || "eng",
      "-c",
      `tessedit_char_whitelist=${options.whitelist || defaultHotspotLabelWhitelist}`,
      "tsv",
    ];
    const result = spawnSync(options.executablePath || "tesseract", args, {
      cwd: workingDirectory,
      encoding: "utf8",
      maxBuffer: 4 * 1024 * 1024,
    });

    if (result.error) {
      throw result.error;
    }

    if (result.status !== 0) {
      return {
        confidence: 0,
        label: "",
        normalizedLabel: "",
        ok: false,
        stderr: result.stderr || "",
      };
    }

    const rows = parseTesseractTsv(result.stdout);
    const words = rows
      .filter((entry) => entry.level === "5" && String(entry.text || "").trim().length > 0)
      .map((entry) => ({
        confidence: Number(entry.conf || 0),
        text: String(entry.text || "").trim(),
      }));
    const label = normalizeHotspotLabel(words.map((entry) => entry.text).join(" "));
    const confidence =
      words.length > 0 ? words.reduce((sum, entry) => sum + Math.max(0, entry.confidence), 0) / words.length : 0;
    const normalizedLabel = normalizeHotspotLabel(label);
    const minimumConfidence = options.minConfidence ?? 0;

    return {
      confidence,
      label,
      normalizedLabel,
      ok: Boolean(normalizedLabel) && confidence >= minimumConfidence,
      stderr: result.stderr || "",
    };
  } finally {
    if (cleanupDirectory) {
      fs.rmSync(workingDirectory, { force: true, recursive: true });
    }
  }
}
