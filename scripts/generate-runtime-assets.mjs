#!/usr/bin/env node
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

export async function generateRuntimeAssets(directory) {
  const versions = {};
  const core = ["scummvm.js", "scummvm.wasm", "scummvm_fs.js", "audio-start-control.mjs", "scummvm.ini", "games.json"];
  async function hashFile(relative) {
    const hash = createHash("sha256");
    for await (const chunk of createReadStream(path.join(directory, relative))) hash.update(chunk);
    versions[`/${relative}`] = `sha-${hash.digest("hex").slice(0, 24)}`;
  }
  async function walk(relative) {
    for (const entry of (await readdir(path.join(directory, relative), { withFileTypes: true })).sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0)) {
      const name = `${relative}/${entry.name}`;
      if (entry.isDirectory()) await walk(name);
      else if (entry.isFile()) await hashFile(name);
    }
  }
  for (const name of core) await hashFile(name);
  await walk("data");
  await walk("launcher/skip-intro").catch((error) => { if (error.code !== "ENOENT") throw error; });
  const htmlPath = path.join(directory, "scummvm.html");
  const original = await readFile(htmlPath, "utf8");
  const html = original.replace(
    /<script id=scummweb-runtime-assets>[\s\S]*?<\/script>/,
    `<script id=scummweb-runtime-assets>globalThis.SCUMMWEB_RUNTIME_ASSETS=${JSON.stringify(versions).replaceAll("<", "\\u003c")};</script>`
  ).replace(/<link id=scummweb-wasm-preload[^>]*>/,
    `<link id=scummweb-wasm-preload rel=preload as=fetch crossorigin=anonymous href=scummvm.wasm?v=${versions["/scummvm.wasm"]}>`)
    .replace(/<link id=scummweb-js-preload[^>]*>/,
      `<link id=scummweb-js-preload rel=preload as=script href=scummvm.js?v=${versions["/scummvm.js"]}>`);
  if (!html.includes("globalThis.SCUMMWEB_RUNTIME_ASSETS=")) throw new Error("Runtime asset marker is missing");
  if (html !== original) await writeFile(htmlPath, html);
  versions["/scummvm.html"] = `sha-${createHash("sha256").update(html).digest("hex").slice(0, 24)}`;
  const manifest = { version: versions["/scummvm.html"], files: versions };
  const manifestPath = path.join(directory, "runtime-assets.json");
  const serialized = JSON.stringify(manifest, null, 2) + "\n";
  if (await readFile(manifestPath, "utf8").catch(() => "") !== serialized) await writeFile(manifestPath, serialized);
  const publicManifest = { version: manifest.version, files: Object.fromEntries([...core, "scummvm.html"].map((name) => [`/${name}`, versions[`/${name}`]])) };
  const publicPath = path.join(directory, "runtime-version.json");
  const publicJson = JSON.stringify(publicManifest, null, 2) + "\n";
  if (await readFile(publicPath, "utf8").catch(() => "") !== publicJson) await writeFile(publicPath, publicJson);
  return manifest;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await generateRuntimeAssets(path.resolve(process.argv[2] || fileURLToPath(new URL("../scummvm-shell", import.meta.url))));
}
