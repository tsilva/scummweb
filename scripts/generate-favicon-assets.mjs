#!/usr/bin/env node

import fs from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const source = await fs.readFile(path.join(root, "image-assets/sources/favicon-source.svg"));
const brandDir = path.join(root, "public/brand/web-seo/favicon");
const sizes = [16, 32, 48];
const frames = [];

await fs.mkdir(brandDir, { recursive: true });
for (const size of sizes) {
  const png = await sharp(source).resize(size, size).png().toBuffer();
  await fs.writeFile(path.join(brandDir, `favicon-${size}.png`), png);
  frames.push(png);
}

// ICO directory entries point to PNG frames, preserving alpha at each size.
const directory = Buffer.alloc(6 + sizes.length * 16);
directory.writeUInt16LE(1, 2);
directory.writeUInt16LE(sizes.length, 4);
let offset = directory.length;
for (const [index, size] of sizes.entries()) {
  const entry = 6 + index * 16;
  directory[entry] = size;
  directory[entry + 1] = size;
  directory.writeUInt16LE(1, entry + 4);
  directory.writeUInt16LE(32, entry + 6);
  directory.writeUInt32LE(frames[index].length, entry + 8);
  directory.writeUInt32LE(offset, entry + 12);
  offset += frames[index].length;
}

const ico = Buffer.concat([directory, ...frames]);
for (const outputDir of [brandDir, path.join(root, "scummvm-shell"), path.join(root, "public")]) {
  await fs.writeFile(path.join(outputDir, "favicon.ico"), ico);
  await fs.writeFile(path.join(outputDir, "favicon.svg"), source);
}

// Render install icons from the vector source at their delivery resolution.
const installIcons = [];
for (const size of [180, 192, 512]) {
  let image = sharp(source, { density: 72 * size / 102 }).resize(size, size);
  if (size === 180) image = image.flatten({ background: "#1a4d1a" });
  const png = await image.png().toBuffer();
  const name = size === 180 ? "apple-touch-icon.png" : `android-chrome-${size}.png`;
  const outputPath = `public/brand/web-seo/${name}`;
  await fs.writeFile(path.join(root, outputPath), png);
  installIcons.push({
    role: size === 180 ? "apple-touch-icon" : "install-icon",
    path: outputPath,
    sha256: createHash("sha256").update(png).digest("hex"),
    source: "image-assets/sources/favicon-source.svg",
  });
  if (size !== 180) {
    for (const directory of ["scummvm-shell", "public"]) {
      await fs.writeFile(path.join(root, directory, `scummvm-${size}.png`), png);
    }
  }
}

// Changed icon URLs let existing installs discover the new artwork.
for (const directory of ["scummvm-shell", "public"]) {
  const manifestPath = path.join(root, directory, "manifest.json");
  const manifest = JSON.parse(await fs.readFile(manifestPath, "utf8"));
  for (const size of [192, 512]) {
    const icon = manifest.icons.find((entry) => entry.sizes === `${size}x${size}`);
    const hash = installIcons.find((entry) => entry.path.endsWith(`-${size}.png`)).sha256;
    icon.src = `scummvm-${size}.png?v=sw-${hash.slice(0, 16)}`;
  }
  await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 4) + "\n");
}

const provenancePath = path.join(root, "image-assets/provenance.json");
const provenance = JSON.parse(await fs.readFile(provenancePath, "utf8"));
for (const icon of installIcons) {
  provenance.exports = provenance.exports.filter((entry) => entry.path !== icon.path);
  provenance.exports.push(icon);
}
await fs.writeFile(provenancePath, JSON.stringify(provenance, null, 2) + "\n");
console.log("Generated SW favicons and 180/192/512px install icons.");
