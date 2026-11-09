import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import test from "node:test";
import sharp from "sharp";
import assetConfig from "../lib/scummvm-shell-assets.js";

test("required shell asset paths are managed and versioned matchers cover expected routes", () => {
  const {
    isVersionedAsset,
    managedPaths,
    requiredPaths,
    versionedAssetMatchers,
  } = assetConfig;

  for (const requiredPath of requiredPaths) {
    assert.ok(
      managedPaths.some((managedPath) => requiredPath === managedPath || requiredPath.startsWith(`${managedPath}/`)),
      `${requiredPath} should be covered by managedPaths`
    );
  }

  assert.ok(versionedAssetMatchers.includes("/launcher/:path*"));
  assert.equal(isVersionedAsset("/launcher/poster.png"), true);
  assert.equal(isVersionedAsset("/scummvm.js"), true);
  assert.equal(isVersionedAsset("/unmanaged.txt"), false);
});

test("install manifests reference an opaque maskable icon and retain standard icons", async () => {
  const shell = new URL("../scummvm-shell/", import.meta.url);
  const brand = new URL("../public/brand/web-seo/", import.meta.url);
  const shellManifest = JSON.parse(fs.readFileSync(new URL("manifest.json", shell)));
  const brandManifest = JSON.parse(fs.readFileSync(new URL("site.webmanifest", brand)));
  assert.deepEqual(shellManifest.icons, brandManifest.icons.map((icon) => ({
    ...icon,
    src: icon.src.replace("android-chrome-", "scummvm-"),
  })));

  assert.deepEqual(shellManifest.icons.filter(({ purpose }) => purpose === "any").map(({ sizes }) => sizes), ["192x192", "512x512"]);
  const maskable = shellManifest.icons.find(({ purpose }) => purpose === "maskable");
  assert.ok(maskable, "Android needs a separate maskable icon");
  assert.equal(maskable.sizes, "512x512");
  assert.equal(maskable.type, "image/png");
  const iconUrl = new URL(maskable.src, shell);
  assert.ok(assetConfig.managedPaths.includes(iconUrl.pathname.split("/").at(-1)));
  const png = fs.readFileSync(iconUrl);
  assert.equal(iconUrl.searchParams.get("v"), `sw-${createHash("sha256").update(png).digest("hex").slice(0, 16)}`);
  const image = sharp(png);
  const { width, height } = await image.metadata();
  assert.equal(width, 512);
  assert.equal(height, 512);
  assert.equal((await image.stats()).isOpaque, true);
});

test("the bundled catalog engines and SCUMM are indexed WebAssembly plugins", () => {
  const shell = new URL("../scummvm-shell/", import.meta.url);
  const catalog = JSON.parse(fs.readFileSync(new URL("games.json", shell)));
  const { plugins } = JSON.parse(fs.readFileSync(new URL("data/index.json", shell)));
  const engines = new Set(["scumm", "got", ...catalog.games.map(({ engineId }) => engineId)]);

  for (const engine of engines) {
    const name = `lib${engine}.so`;
    const module = fs.readFileSync(new URL(`data/plugins/${name}`, shell));
    assert.equal(plugins[name], module.length, `${name} must match the filesystem index`);
    assert.equal(module.subarray(0, 4).toString(), "\0asm", `${name} must be WebAssembly`);
  }
});

test("the bundled SCUMM engine can open FLAC speech archives", () => {
  const path = new URL("../scummvm-shell/data/plugins/libscumm.so", import.meta.url);
  const plugin = new WebAssembly.Module(fs.readFileSync(path));
  assert.ok(WebAssembly.Module.imports(plugin).some(({ name }) => name.includes("makeFLACStream")));
});
