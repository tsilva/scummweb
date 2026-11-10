#!/usr/bin/env node
import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import sharp from "sharp";
import { readArtworkFile } from "./artwork-files.mjs";
import { resolveArtworkWorkspace } from "./artwork-workspace.mjs";

const rootDir = fileURLToPath(new URL("../", import.meta.url));
const origin = "https://scummvm-games.tsilva.eu";
const types = { ".webp": "image/webp", ".avif": "image/avif", ".png": "image/png", ".jpg": "image/jpeg" };
const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");
const manifestFile = "data/artwork-storage.json";
const workspace = resolveArtworkWorkspace();
const backupDir = `${workspace}/objects`;
const pendingFile = `${workspace}/manifest.json`;
const isArtworkSource = (name) => /^\/launcher\/[a-z0-9-]+\.(?:webp|png|avif)$/.test(name);

async function encodePlaceholder(bytes) {
  return sharp(bytes).resize(12, 12, { fit: "inside", withoutEnlargement: true })
    .webp({ quality: 55 }).toBuffer().then((preview) => preview.toString("base64"));
}

async function writeManifest(filename, manifest) {
  const temporary = `${filename}.${randomUUID()}.tmp`;
  try {
    await fs.writeFile(temporary, `${JSON.stringify(manifest, null, 2)}\n`, { flag: "wx" });
    await fs.rename(temporary, filename);
  } finally { await fs.rm(temporary, { force: true }); }
}

export function validateManifest(manifest) {
  if (manifest.version !== 1 || manifest.origin !== origin || typeof manifest.published !== "boolean"
    || !manifest.files || Array.isArray(manifest.files) || !Object.keys(manifest.files).length) {
    throw new Error("Invalid or empty artwork storage manifest");
  }
  for (const [name, file] of Object.entries(manifest.files)) {
    if (!/^\/launcher\/(?:(?:responsive|optimized)\/)?[a-z0-9-]+\.(?:webp|png|avif)$/.test(name)
      && name !== "/image-assets/sources/road-gameplay.jpg") throw new Error(`Invalid artwork path: ${name}`);
    if (!/^[a-f0-9]{64}$/.test(file.sha256) || file.key !== `artwork/${file.sha256}/${path.posix.basename(name)}`
      || !Number.isSafeInteger(file.bytes) || file.bytes < 1 || file.contentType !== types[path.extname(name)]
      || !Number.isSafeInteger(file.width) || file.width < 1 || !Number.isSafeInteger(file.height) || file.height < 1) {
      throw new Error(`Invalid artwork record: ${name}`);
    }
    if (file.placeholder !== undefined && (!isArtworkSource(name) || typeof file.placeholder !== "string"
      || !/^UklGR[A-Za-z0-9+/]+={0,2}$/.test(file.placeholder)
      || file.placeholder.length % 4 || file.placeholder.length > 1024)) {
      throw new Error(`Invalid artwork placeholder: ${name}`);
    }
  }
  for (const [source, image] of Object.entries(manifest.images || {})) {
    const original = manifest.files[source];
    const fallback = manifest.files[image.fallback];
    if (!original || !fallback || image.width !== original.width || image.height !== original.height
      || fallback.width !== image.width || fallback.height !== image.height
      || !Array.isArray(image.webp) || !image.webp.includes(image.fallback) || !Array.isArray(image.avif)) {
      throw new Error(`Invalid image delivery mapping: ${source}`);
    }
    for (const [format, names] of [["image/webp", image.webp], ["image/avif", image.avif]]) {
      let previousWidth = 0;
      for (const name of names) {
        const file = manifest.files[name];
        if (!file || file.contentType !== format || file.width <= previousWidth || file.width > image.width
          || Math.abs(file.height / file.width - image.height / image.width) > 0.01) {
          throw new Error(`Invalid image variant: ${name}`);
        }
        previousWidth = file.width;
      }
    }
  }
  return manifest;
}

export async function planArtwork(root = rootDir) {
  const previousBytes = await fs.readFile(path.join(root, manifestFile));
  const previous = JSON.parse(previousBytes);
  if (previous.published) validateManifest(previous);
  const names = new Map();
  for (const base of ["scummvm-shell", `${workspace}/inputs`]) {
    for (const relative of ["launcher", "launcher/responsive", "launcher/optimized"]) {
      const directory = `${base}/${relative}`;
      for (const entry of await fs.readdir(path.join(root, directory), { withFileTypes: true }).catch((error) => {
        if (error.code !== "ENOENT") throw error; return [];
      })) {
        if (entry.isFile() && types[path.extname(entry.name)]) names.set(`/${relative}/${entry.name}`, `${directory}/${entry.name}`);
      }
    }
  }
  if (await fs.stat(path.join(root, "image-assets/sources/road-gameplay.jpg")).catch(() => null)) {
    names.set("/image-assets/sources/road-gameplay.jpg", "image-assets/sources/road-gameplay.jpg");
  }
  const files = { ...previous.files };
  for (const [name, filename] of [...names].sort(([a], [b]) => a.localeCompare(b, "en"))) {
    const bytes = await fs.readFile(path.join(root, filename));
    const sha256 = digest(bytes);
    const { width, height } = await sharp(bytes).metadata();
    const key = `artwork/${sha256}/${path.basename(filename)}`;
    const destination = path.join(root, backupDir, key);
    await fs.mkdir(path.dirname(destination), { recursive: true });
    await fs.writeFile(destination, bytes);
    const placeholder = isArtworkSource(name)
      ? (previous.files[name]?.sha256 === sha256 && previous.files[name].placeholder) || await encodePlaceholder(bytes)
      : undefined;
    files[name] = { key, sha256, bytes: bytes.length, contentType: types[path.extname(filename)], width, height, ...(placeholder ? { placeholder } : {}) };
  }
  const delivery = await fs.readFile(path.join(root, workspace, "delivery.json"), "utf8")
    .then(JSON.parse).catch((error) => { if (error.code !== "ENOENT") throw error; return null; });
  const images = delivery?.images || previous.images;
  if (delivery?.sourceRecords && Object.entries(delivery.sourceRecords).some(([name, hash]) => files[name]?.sha256 !== hash)) {
    throw new Error("Artwork source inputs changed after optimization");
  }
  if (delivery && delivery.sourceHash !== digest(await fs.readFile(path.join(root, manifestFile)))
    && JSON.stringify(delivery.images) !== JSON.stringify(previous.images)) {
    throw new Error("Artwork storage changed after optimization; regenerate delivery candidates");
  }
  const manifest = validateManifest({ version: 1, published: false, origin, files, ...(images ? { images } : {}), baseHash: digest(previousBytes) });
  if (!previousBytes.equals(await fs.readFile(path.join(root, manifestFile)))) throw new Error("Artwork storage changed during planning");
  await fs.mkdir(path.dirname(path.join(root, pendingFile)), { recursive: true });
  await writeManifest(path.join(root, pendingFile), manifest);
  return manifest;
}

export async function backfillArtworkPlaceholders(root = rootDir, request = fetch) {
  const filename = path.join(root, manifestFile);
  const before = await fs.readFile(filename);
  const manifest = validateManifest(JSON.parse(before));
  if (!manifest.published) throw new Error("Plan local artwork or activate published artwork before backfilling placeholders");
  const pending = Object.entries(manifest.files).filter(([name, file]) => isArtworkSource(name) && !file.placeholder);
  const count = pending.length;
  await Promise.all(Array.from({ length: Math.min(8, count) }, async () => {
    while (pending.length) {
      const [name, file] = pending.pop();
      const bytes = await readArtworkFile(root, name, request, { manifest, cacheDownload: false });
      file.placeholder = await encodePlaceholder(bytes);
    }
  }));
  if (!before.equals(await fs.readFile(filename))) throw new Error("Artwork storage changed during placeholder generation");
  if (count) await writeManifest(filename, validateManifest(manifest));
  return count;
}

export async function verifyArtwork(manifest, request = fetch, cacheRoot) {
  validateManifest(manifest);
  const pending = Object.values(manifest.files);
  let verified = 0;
  await Promise.all(Array.from({ length: Math.min(8, pending.length) }, async () => {
    while (pending.length) {
      const file = pending.pop();
      const response = await request(`${manifest.origin}/${file.key}`, {
        redirect: "error", signal: AbortSignal.timeout(30_000),
      });
      if (!response.ok || response.headers.get("content-type")?.split(";")[0] !== file.contentType
        || !/\bimmutable\b/.test(response.headers.get("cache-control") || "")) {
        throw new Error(`Artwork response or cache metadata failed: ${file.key}`);
      }
      // All objects have known lengths; cap the body before buffering an unexpected response.
      const chunks = [];
      let length = 0;
      for await (const chunk of response.body) {
        length += chunk.length;
        if (length > file.bytes) throw new Error(`Artwork length mismatch: ${file.key}`);
        chunks.push(chunk);
      }
      const bytes = Buffer.concat(chunks);
      if (length !== file.bytes || digest(bytes) !== file.sha256) {
        throw new Error(`Artwork checksum mismatch: ${file.key}`);
      }
      if (cacheRoot) {
        const directory = path.join(cacheRoot, ".cache/artwork");
        await fs.mkdir(directory, { recursive: true });
        await fs.writeFile(path.join(directory, file.sha256), bytes);
      }
      verified += 1;
    }
  }));
  return verified;
}

export async function activateArtwork(root = rootDir, request = fetch) {
  const filename = path.join(root, manifestFile);
  const before = await fs.readFile(filename, "utf8");
  const pending = await fs.readFile(path.join(root, pendingFile), "utf8");
  const manifest = JSON.parse(pending);
  if (manifest.baseHash && manifest.baseHash !== digest(before)) throw new Error("Artwork storage changed since planning; merge and replan before activation");
  await verifyArtwork(manifest, request, root);
  if (before !== await fs.readFile(filename, "utf8")) throw new Error("Artwork manifest changed during verification");
  if (pending !== await fs.readFile(path.join(root, pendingFile), "utf8")) throw new Error("Artwork plan changed during verification");
  manifest.published = true;
  delete manifest.baseHash;
  await writeManifest(filename, manifest);
  return manifest;
}

export async function retireArtwork(root = rootDir, request = fetch) {
  const filename = path.join(root, manifestFile);
  const before = await fs.readFile(filename, "utf8");
  const manifest = JSON.parse(before);
  if (!manifest.published) throw new Error("Publish and activate artwork before retiring local images");
  validateManifest(manifest);
  await verifyArtwork(manifest, request, root);
  const removals = [];
  // Preserve every local original outside Git before removing any source or staged image.
  for (const [name, file] of Object.entries(manifest.files)) {
    const backup = path.join(root, backupDir, file.key);
    for (const relative of name.startsWith("/launcher/")
      ? [`${workspace}/inputs${name}`, `scummvm-shell${name}`, `public${name}`, `dist${name}`] : [name.slice(1)]) {
      const local = path.join(root, relative);
      const bytes = await fs.readFile(local).catch((error) => { if (error.code !== "ENOENT") throw error; return null; });
      if (!bytes) continue;
      if (digest(bytes) !== file.sha256) throw new Error(`Local artwork changed: ${relative}`);
      await fs.mkdir(path.dirname(backup), { recursive: true });
      await fs.writeFile(backup, bytes);
      if (digest(await fs.readFile(backup)) !== file.sha256) throw new Error("Artwork backup verification failed");
      removals.push({ local, sha256: file.sha256 });
    }
  }
  if (before !== await fs.readFile(filename, "utf8")) throw new Error("Artwork manifest changed during retirement");
  for (const { local, sha256 } of removals) {
    if (digest(await fs.readFile(local)) !== sha256) throw new Error("Artwork changed before retirement");
    await fs.unlink(local);
  }
  return removals.length;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    const command = process.argv[2];
    if (process.argv.length !== 3 || !["plan", "verify", "activate", "retire-local", "placeholders"].includes(command)) {
      throw new Error("Usage: node scripts/artwork-storage.mjs <plan|verify|activate|retire-local|placeholders>");
    }
    const result = command === "plan" ? await planArtwork()
      : command === "activate" ? await activateArtwork()
      : command === "retire-local" ? await retireArtwork()
      : command === "placeholders" ? await backfillArtworkPlaceholders()
      : await verifyArtwork(JSON.parse(await fs.readFile(path.join(rootDir, pendingFile))));
    console.log(`Artwork ${command}: ${typeof result === "number" ? result : Object.keys(result.files).length} files`);
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
