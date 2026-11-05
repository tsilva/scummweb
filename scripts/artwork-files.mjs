import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");

// Build-time only. Browsers always request published artwork directly from R2.
export async function readArtworkFile(root, name, request = fetch) {
  if (!/^\/launcher\/(?:(?:responsive|optimized)\/)?[a-z0-9-]+\.(?:webp|png|avif)$/.test(name)) {
    throw new Error(`Invalid artwork path: ${name}`);
  }
  const manifest = await fs.readFile(path.join(root, "data/artwork-storage.json"), "utf8")
    .then(JSON.parse).catch((error) => { if (error.code !== "ENOENT") throw error; return null; });
  const entry = manifest?.published && manifest.files[name];
  if (entry && (!/^[a-f0-9]{64}$/.test(entry.sha256) || !Number.isSafeInteger(entry.bytes) || entry.bytes < 1)) {
    throw new Error("Invalid artwork checksum metadata");
  }
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
  const response = await request(`${manifest.origin}/${entry.key}`, { redirect: "error", signal: AbortSignal.timeout(30_000) });
  if (!response.ok) throw new Error(`Could not download artwork: ${name}`);
  const chunks = [];
  let length = 0;
  for await (const chunk of response.body) {
    length += chunk.length;
    if (length > entry.bytes) throw new Error(`Artwork size mismatch: ${name}`);
    chunks.push(chunk);
  }
  const bytes = Buffer.concat(chunks);
  if (!valid(bytes)) throw new Error(`Artwork checksum mismatch: ${name}`);
  await fs.mkdir(path.dirname(cache), { recursive: true });
  await fs.writeFile(cache, bytes);
  return bytes;
}
