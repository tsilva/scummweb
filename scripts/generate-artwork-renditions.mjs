#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const root = fileURLToPath(new URL("../", import.meta.url));
const launcher = path.join(root, "scummvm-shell/launcher");
const output = path.join(launcher, "responsive");
const manifestPath = path.join(root, "data/artwork-renditions.json");
const storage = JSON.parse(await fs.readFile(path.join(root, "data/artwork-storage.json"), "utf8"));
const manifest = storage.published ? JSON.parse(await fs.readFile(manifestPath, "utf8")) : {};
const wanted = new Set();
const processed = new Set();
await fs.mkdir(output, { recursive: true });

for (const name of (await fs.readdir(launcher)).sort()) {
  if (!/-(cover|poster)\.webp$/.test(name)) continue;
  processed.add(name.slice(0, -5));
  const source = await fs.readFile(path.join(launcher, name));
  const { width, height } = await sharp(source).metadata();
  const widths = [];
  delete manifest[`/launcher/${name}`];
  for (const size of [320, 640]) {
    if (size >= width) continue;
    const image = await sharp(source).resize({ width: size }).webp({ quality: 80, effort: 6 }).toBuffer();
    // A smaller rendition must also reduce transfer size.
    if (image.length >= source.length) continue;
    const file = `${name.slice(0, -5)}-${size}.webp`;
    wanted.add(file);
    const destination = path.join(output, file);
    const previous = await fs.readFile(destination).catch((error) => {
      if (error.code !== "ENOENT") throw error;
      return null;
    });
    if (!previous?.equals(image)) await fs.writeFile(destination, image);
    widths.push(size);
  }
  if (widths.length) manifest[`/launcher/${name}`] = { width, height, widths };
}
for (const name of await fs.readdir(output)) {
  const generated = /^(.*)-(320|640)\.webp$/.exec(name);
  if (generated && /-(cover|poster)$/.test(generated[1]) && !wanted.has(name)
    && (!storage.published || processed.has(generated[1]))) {
    await fs.unlink(path.join(output, name));
  }
}
const contents = `${JSON.stringify(manifest, null, 2)}\n`;
const previous = await fs.readFile(manifestPath, "utf8").catch((error) => {
  if (error.code !== "ENOENT") throw error;
  return null;
});
if (contents !== previous) await fs.writeFile(manifestPath, contents);
console.log(`Artwork: ${Object.keys(manifest).length} originals, ${wanted.size} smaller renditions.`);
