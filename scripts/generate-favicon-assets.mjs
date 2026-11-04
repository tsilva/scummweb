#!/usr/bin/env node

import fs from "node:fs/promises";
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
console.log("Generated SW favicons (SVG and 16/32/48px ICO/PNG).");
