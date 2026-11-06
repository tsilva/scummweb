#!/usr/bin/env node

import fs from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourcePath = "image-assets/sources/icon-source.png";
const source = await fs.readFile(path.join(root, sourcePath));
const brandDir = path.join(root, "public/brand/web-seo/favicon");
const sizes = [16, 32, 48];
const frames = [];
const exports = [];
const versions = {};
const fingerprint = (bytes) => createHash("sha256").update(bytes).digest("hex");

async function writeExport(outputPath, bytes, role) {
  await fs.writeFile(path.join(root, outputPath), bytes);
  const sha256 = fingerprint(bytes);
  exports.push({ role, path: outputPath, sha256, source: sourcePath });
  if (outputPath.startsWith("public/")) versions[outputPath.slice(6)] = `sha-${sha256.slice(0, 24)}`;
  else if (outputPath.startsWith("scummvm-shell/")) versions[outputPath.slice(13)] = `sha-${sha256.slice(0, 24)}`;
}

await fs.mkdir(brandDir, { recursive: true });
for (const size of sizes) {
  const png = await sharp(source).resize(size, size).png().toBuffer();
  await writeExport(`public/brand/web-seo/favicon/favicon-${size}.png`, png, "favicon");
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
// Embed a small raster rendition, keeping the SVG favicon compact and faithful
// to the selected artwork rather than approximating its shading with vectors.
const svgPng = await sharp(source).resize(64, 64).png().toBuffer();
const svg = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><title>ScummWEB</title><image width="64" height="64" href="data:image/png;base64,${svgPng.toString("base64")}"/></svg>\n`);
await writeExport("image-assets/sources/favicon-source.svg", svg, "favicon-svg");
for (const outputDir of ["public/brand/web-seo/favicon", "scummvm-shell", "public"]) {
  await writeExport(`${outputDir}/favicon.ico`, ico, "favicon");
  await writeExport(`${outputDir}/favicon.svg`, svg, "favicon-svg");
}

await writeExport("public/brand/icon/icon-1024.png", await sharp(source).resize(1024, 1024).png().toBuffer(), "app-icon");

// Derive every install size from the untouched generated source.
const installIcons = [];
for (const size of [180, 192, 512]) {
  let image = sharp(source).resize(size, size);
  if (size === 180) image = image.flatten({ background: "#06451b" });
  const png = await image.png().toBuffer();
  const name = size === 180 ? "apple-touch-icon.png" : `android-chrome-${size}.png`;
  const outputPath = `public/brand/web-seo/${name}`;
  await writeExport(outputPath, png, size === 180 ? "apple-touch-icon" : "install-icon");
  installIcons.push({
    role: size === 180 ? "apple-touch-icon" : "install-icon",
    path: outputPath,
    sha256: fingerprint(png),
    source: sourcePath,
  });
  if (size !== 180) {
    for (const directory of ["scummvm-shell", "public"]) {
      await writeExport(`${directory}/scummvm-${size}.png`, png, "install-icon");
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
    icon.purpose = "any";
  }
  const bytes = JSON.stringify(manifest, null, 4) + "\n";
  await fs.writeFile(manifestPath, bytes);
  versions["/manifest.json"] = `sha-${fingerprint(bytes).slice(0, 24)}`;
}

const webManifestPath = path.join(root, "public/brand/web-seo/site.webmanifest");
const webManifest = JSON.parse(await fs.readFile(webManifestPath, "utf8"));
for (const icon of webManifest.icons) {
  const size = Number.parseInt(icon.sizes, 10);
  const hash = installIcons.find((entry) => entry.path.endsWith(`-${size}.png`)).sha256;
  icon.src = `android-chrome-${size}.png?v=sw-${hash.slice(0, 16)}`;
}
await writeExport("public/brand/web-seo/site.webmanifest", Buffer.from(JSON.stringify(webManifest, null, 2) + "\n"), "web-manifest");
await fs.writeFile(path.join(root, "image-assets/icon-versions.json"), JSON.stringify(versions, null, 2) + "\n");

const provenancePath = path.join(root, "image-assets/provenance.json");
const provenance = JSON.parse(await fs.readFile(provenancePath, "utf8"));
// The old vector source is now a generated compatibility export.
provenance.sources = provenance.sources.filter((entry) => entry.path !== "image-assets/sources/favicon-source.svg");
provenance.sources.find((entry) => entry.path === sourcePath).sha256 = fingerprint(source);
for (const icon of exports) {
  provenance.exports = provenance.exports.filter((entry) => entry.path !== icon.path);
  provenance.exports.push(icon);
}
await fs.writeFile(provenancePath, JSON.stringify(provenance, null, 2) + "\n");
const brandManifestPath = path.join(root, "public/brand/manifest.json");
const brandManifest = JSON.parse(await fs.readFile(brandManifestPath, "utf8"));
const svgAsset = brandManifest.assets.find((entry) => entry.key === "favicon-svg");
svgAsset.width = svgAsset.height = 64;
await fs.writeFile(brandManifestPath, JSON.stringify(brandManifest, null, 2) + "\n");
console.log("Generated Emerald Cartridge favicons and 180/192/512/1024px app icons.");
