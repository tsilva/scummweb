import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";

const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");

function retryableDownload(error) {
  return error?.status === 408 || error?.status === 429 || error?.status >= 500 ||
    error?.name === "TimeoutError" || error?.name === "AbortError" ||
    (error instanceof TypeError && ["fetch failed", "terminated"].includes(error.message));
}

async function downloadArtwork(name, url, entry, request) {
  const attempts = 3;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      const response = await request(url, { redirect: "error", signal: AbortSignal.timeout(30_000) });
      if (!response.ok) {
        await response.body?.cancel?.().catch(() => {});
        throw Object.assign(new Error(`HTTP ${response.status}`), { status: response.status });
      }
      const chunks = [];
      let length = 0;
      for await (const chunk of response.body) {
        length += chunk.length;
        if (length > entry.bytes) {
          await response.body.cancel?.().catch(() => {});
          throw new Error(`Artwork size mismatch: ${name}`);
        }
        chunks.push(chunk);
      }
      const bytes = Buffer.concat(chunks);
      if (bytes.length !== entry.bytes || digest(bytes) !== entry.sha256) {
        throw new Error(`Artwork checksum mismatch: ${name}`);
      }
      return bytes;
    } catch (error) {
      if (!retryableDownload(error) || attempt === attempts) {
        const detail = error?.cause?.code || error?.message || String(error);
        throw new Error(`Could not download artwork: ${name} (${detail}; ${attempt} attempt${attempt === 1 ? "" : "s"})`, { cause: error });
      }
      await delay(250 * attempt);
    }
  }
}

export function getPublishedArtworkEntry(manifest, name) {
  if (!/^\/launcher\/(?:(?:responsive|optimized)\/)?[a-z0-9-]+\.(?:webp|png|avif)$/.test(name)) {
    throw new Error(`Invalid artwork path: ${name}`);
  }
  const entry = manifest?.published && manifest.files[name];
  if (entry && (!/^[a-f0-9]{64}$/.test(entry.sha256) || !Number.isSafeInteger(entry.bytes) || entry.bytes < 1)) {
    throw new Error("Invalid artwork checksum metadata");
  }
  return entry;
}

// Build-time only. Browsers always request published artwork directly from R2.
export async function readArtworkFile(root, name, request = fetch, { manifest, cacheDownload = true } = {}) {
  manifest ??= await fs.readFile(path.join(root, "data/artwork-storage.json"), "utf8")
    .then(JSON.parse).catch((error) => { if (error.code !== "ENOENT") throw error; return null; });
  const entry = getPublishedArtworkEntry(manifest, name);
  const source = path.join(root, "scummvm-shell", name.slice(1));
  const local = await fs.readFile(source).catch((error) => { if (error.code !== "ENOENT") throw error; return null; });
  if (!entry) {
    if (!local) throw Object.assign(new Error(`Missing local artwork: ${name}`), { code: "ENOENT" });
    return local;
  }
  const valid = (bytes) => bytes.length === entry.bytes && digest(bytes) === entry.sha256;
  if (local && valid(local)) return local;
  const cache = path.join(root, ".cache/artwork", entry.sha256);
  const cached = await fs.readFile(cache).catch((error) => { if (error.code !== "ENOENT") throw error; return null; });
  if (cached && valid(cached)) return cached;
  if (manifest.origin !== "https://scummvm-games.tsilva.eu"
    || entry.key !== `artwork/${entry.sha256}/${path.posix.basename(name)}`) throw new Error("Untrusted artwork location");
  const bytes = await downloadArtwork(name, `${manifest.origin}/${entry.key}`, entry, request);
  if (cacheDownload) {
    await fs.mkdir(path.dirname(cache), { recursive: true });
    await fs.writeFile(cache, bytes);
  }
  return bytes;
}
