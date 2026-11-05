#!/usr/bin/env node
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import sharp from "sharp";
import { readArtworkFile } from "./artwork-files.mjs";
import { resolveArtworkWorkspace } from "./artwork-workspace.mjs";

const rootDir = fileURLToPath(new URL("../", import.meta.url));
const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");
const inputPath = (root, name) => path.join(root, resolveArtworkWorkspace(), "inputs", name.slice(1));

export function psnr(reference, candidate) {
  if (reference.length !== candidate.length) throw new Error("Image comparison dimensions differ");
  let squared = 0;
  for (let i = 0; i < reference.length; i += 1) squared += (reference[i] - candidate[i]) ** 2;
  return squared ? 10 * Math.log10(255 ** 2 * reference.length / squared) : Infinity;
}

export async function finalizeDelivery(root, delivery, { complete = true, changedNames } = {}) {
  // Some resolutions compress best at a lower AVIF quality setting while still
  // meeting the same decoded-quality floor. Fill those gaps before selecting a format.
  const pending = Object.entries(delivery.images).filter(([name]) => /-(?:cover|poster|hero)(?:-mobile)?\./.test(name)
    && (!changedNames || changedNames.has(name)));
  if (complete) await Promise.all(Array.from({ length: 2 }, async () => {
    while (pending.length) {
      const [name, image] = pending.shift();
      const source = await readArtworkFile(root, name);
      const stem = path.posix.basename(name).replace(/\.[^.]+$/, "");
      const width = (value) => value === image.fallback ? image.width
        : Number(/-(\d+)\.(?:webp|avif)$/.exec(value)?.[1]) || image.width;
      const present = new Set(image.avif.map(width));
      for (const webpName of image.webp) {
        const size = width(webpName);
        if (present.has(size)) continue;
        const full = size === image.width;
        const pipeline = () => full ? sharp(source) : sharp(source).resize({ width: size, withoutEnlargement: true });
        const webp = full ? await fs.readFile(inputPath(root, image.fallback)).catch(async (error) => {
          if (error.code !== "ENOENT") throw error; return readArtworkFile(root, image.fallback);
        }) : await fs.readFile(inputPath(root, webpName));
        const encoded = await pipeline().avif({ quality: 60, effort: 6, chromaSubsampling: "4:4:4" }).toBuffer();
        if (encoded.length > webp.length * 0.9) break;
        const reference = await pipeline().removeAlpha().raw().toBuffer();
        const decoded = await sharp(encoded).removeAlpha().raw().toBuffer();
        if (psnr(reference, decoded) < 35) break;
        const filename = full ? `/launcher/optimized/${stem}.avif` : `/launcher/responsive/${stem}-${size}.avif`;
        const destination = inputPath(root, filename);
        await fs.mkdir(path.dirname(destination), { recursive: true });
        await fs.writeFile(destination, encoded);
        image.avif.push(filename);
        present.add(size);
        delivery.stats.avifAccepted += 1;
        delivery.stats.generated += 1;
      }
      image.avif.sort((a, b) => width(a) - width(b));
    }
  }));
  for (const image of Object.values(delivery.images)) {
    const width = (name) => name === image.fallback ? image.width
      : Number(/-(\d+)\.(?:webp|avif)$/.exec(name)?.[1]) || image.width;
    const widths = new Set(image.avif.map(width));
    if (image.webp.every((name) => widths.has(width(name)))) continue;
    for (const name of image.avif) {
      if (!/^\/launcher\/(?:responsive|optimized)\/[a-z0-9-]+\.avif$/.test(name)) throw new Error("Invalid generated AVIF path");
      await fs.rm(inputPath(root, name), { force: true });
    }
    delivery.stats.avifAccepted -= image.avif.length;
    delivery.stats.avifRejected += image.avif.length;
    image.avif = [];
  }
  const directory = path.join(root, resolveArtworkWorkspace());
  await fs.mkdir(directory, { recursive: true });
  await fs.writeFile(path.join(directory, "delivery.json"), `${JSON.stringify(delivery, null, 2)}\n`);
  return delivery;
}

export async function optimizeArtwork({ root = rootDir, avif = true, resume = true } = {}) {
  const storageBytes = await fs.readFile(path.join(root, "data/artwork-storage.json"));
  const storage = JSON.parse(storageBytes);
  if (!storage.published) throw new Error("Publish the source artwork before generating delivery variants");
  const prior = resume ? await fs.readFile(path.join(root, resolveArtworkWorkspace(), "delivery.json"), "utf8")
    .then(JSON.parse).catch((error) => { if (error.code !== "ENOENT") throw error; return null; }) : null;
  const reusable = prior?.encodingVersion === 1 && prior.avifEnabled === avif;
  const images = reusable ? { ...prior.images } : {};
  const stats = reusable ? { ...prior.stats }
    : { sources: 0, pngOriginalBytes: 0, pngWebpBytes: 0, generated: 0, avifAccepted: 0, avifRejected: 0 };
  const inputs = Object.entries(storage.files).filter(([name]) => /^\/launcher\/[a-z0-9-]+\.(?:webp|png)$/.test(name));
  const stems = inputs.map(([name]) => path.posix.basename(name).replace(/\.[^.]+$/, ""));
  if (new Set(stems).size !== stems.length) throw new Error("Artwork stems collide; choose unique logical names");
  async function save(name, bytes) {
    const filename = inputPath(root, name);
    await fs.mkdir(path.dirname(filename), { recursive: true });
    const previous = await fs.readFile(filename).catch((error) => { if (error.code !== "ENOENT") throw error; return null; });
    if (!previous?.equals(bytes)) await fs.writeFile(filename, bytes);
    stats.generated += 1;
    return name;
  }
  async function optimize([name, file]) {
    const source = await readArtworkFile(root, name);
    const stem = path.posix.basename(name).replace(/\.[^.]+$/, "");
    const screenshot = /-shot(?:-|\.)/.test(name);
    const promotional = /-(?:cover|poster|hero)(?:-mobile)?\./.test(name);
    const image = { width: file.width, height: file.height, fallback: name, webp: [], avif: [] };
    let fallbackBytes = source;
    if (name.endsWith(".png")) {
      fallbackBytes = await sharp(source).webp({ lossless: true, effort: 6 }).toBuffer();
      const reference = await sharp(source).ensureAlpha().raw().toBuffer();
      const result = await sharp(fallbackBytes).ensureAlpha().raw().toBuffer();
      if (!reference.equals(result)) throw new Error(`PNG conversion changed pixels: ${name}`);
      image.fallback = await save(`/launcher/optimized/${stem}.webp`, fallbackBytes);
      stats.pngOriginalBytes += source.length;
      stats.pngWebpBytes += fallbackBytes.length;
    }
    const widths = screenshot ? [320, 480, 640, 960, 1280] : /-hero/.test(name) ? [640, 960, 1280, 1920] : [320, 480, 640];
    const sizes = [...widths.filter((width) => width < file.width), file.width];
    for (const width of sizes) {
      const full = width === file.width;
      const pipeline = () => full ? sharp(source) : sharp(source).resize({ width, withoutEnlargement: true });
      let webp = full ? fallbackBytes : await pipeline().webp(screenshot
        ? { lossless: true, effort: 6 } : { quality: 80, effort: 6 }).toBuffer();
      const webpName = full ? image.fallback : `/launcher/responsive/${stem}-${width}.webp`;
      // Existing published poster variants already passed the smaller-than-original gate.
      if (!full && storage.files[webpName]) webp = await readArtworkFile(root, webpName);
      if (full || webp.length < fallbackBytes.length) {
        image.webp.push(full ? webpName : await save(webpName, webp));
      }
      if (avif && promotional) {
        const encoded = await pipeline().avif({ quality: 70, effort: 6, chromaSubsampling: "4:4:4" }).toBuffer();
        if (encoded.length <= webp.length * 0.9) {
          const reference = await pipeline().removeAlpha().raw().toBuffer();
          const result = await sharp(encoded).removeAlpha().raw().toBuffer();
          if (psnr(reference, result) >= 35) {
            image.avif.push(await save(full ? `/launcher/optimized/${stem}.avif` : `/launcher/responsive/${stem}-${width}.avif`, encoded));
            stats.avifAccepted += 1;
            continue;
          }
        }
        stats.avifRejected += 1;
      }
    }
    images[name] = image;
    stats.sources += 1;
    if (stats.sources % 25 === 0) console.log(`Optimized ${stats.sources}/${inputs.length} source images`);
  }
  // Bound encoder CPU/memory usage; AVIF encoding runs offline, never during ordinary builds.
  const pending = [];
  for (const [name, file] of inputs) {
    const image = images[name];
    const references = image ? [...image.webp, ...image.avif] : [];
    let available = Boolean(image) && prior.sourceRecords?.[name] === file.sha256;
    for (const reference of references) {
      if (!storage.files[reference] && !await fs.stat(inputPath(root, reference)).catch(() => null)) available = false;
    }
    if (!available) {
      if (image) stats.sources -= 1;
      pending.push([name, file]);
    }
  }
  const changedNames = new Set(pending.map(([name]) => name));
  await Promise.all(Array.from({ length: 2 }, async () => {
    while (pending.length) await optimize(pending.shift());
  }));
  if (!storageBytes.equals(await fs.readFile(path.join(root, "data/artwork-storage.json")))) {
    throw new Error("Artwork storage changed during optimization; active delivery was preserved");
  }
  const directory = path.join(root, resolveArtworkWorkspace());
  await fs.mkdir(directory, { recursive: true });
  const sorted = Object.fromEntries(Object.entries(images).sort(([a], [b]) => a.localeCompare(b, "en")));
  await finalizeDelivery(root, { encodingVersion: 1, avifEnabled: avif, sourceHash: digest(storageBytes),
    sourceRecords: Object.fromEntries(inputs.map(([name, file]) => [name, file.sha256])), images: sorted, stats }, { complete: avif, changedNames });
  console.log(JSON.stringify(stats));
  return { images: sorted, stats };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  optimizeArtwork().catch((error) => { console.error(error.message); process.exitCode = 1; });
}
