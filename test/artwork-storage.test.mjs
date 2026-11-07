import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";
import sharp from "sharp";
import { activateArtwork, planArtwork, retireArtwork, validateManifest, verifyArtwork } from "../scripts/artwork-storage.mjs";
import { artworkPath, artworkUrl } from "../lib/artwork-storage.mjs";
import { readArtworkFile } from "../scripts/artwork-files.mjs";

const bytes = await sharp({ create: { width: 8, height: 12, channels: 3, background: "#aabbcc" } }).webp().toBuffer();
const sha256 = createHash("sha256").update(bytes).digest("hex");
const file = { key: `artwork/${sha256}/sample-cover.webp`, sha256, bytes: bytes.length, width: 8, height: 12, contentType: "image/webp" };
const sample = { version: 1, published: false, origin: "https://scummvm-games.tsilva.eu", files: { "/launcher/sample-cover.webp": file } };
const manifestFile = "data/artwork-storage.json";
const pendingFile = ".internal/evidence/artwork-migration/manifest.json";

async function fixture(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "scummweb-artwork-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  for (const name of ["data", "scummvm-shell/launcher/responsive", ".internal/evidence/artwork-migration"]) {
    await fs.mkdir(path.join(root, name), { recursive: true });
  }
  await fs.writeFile(path.join(root, manifestFile), JSON.stringify({ ...sample, files: {} }));
  await fs.writeFile(path.join(root, "scummvm-shell/launcher/sample-cover.webp"), bytes);
  return root;
}

const response = (data = bytes, headers = {}) => new Response(data, {
  headers: { "content-type": "image/webp", "cache-control": "public, max-age=31536000, immutable", ...headers },
});

test("only published registered images resolve to immutable R2 URLs; source mappings round-trip", () => {
  const source = "/launcher/sample-cover.webp?v=deployment-one";
  assert.equal(artworkUrl(source, sample), source);
  const published = { ...sample, published: true };
  assert.equal(artworkUrl(source, published), `${sample.origin}/${file.key}`);
  assert.equal(artworkPath(artworkUrl(source, published), published), "/launcher/sample-cover.webp");
  for (const value of ["/launcher/notices/sky.txt", "/launcher/skip-intro/sky/SKY-VM.000", "https://untrusted.test/image.webp", "blob:test"]) {
    assert.equal(artworkUrl(value, published), value);
  }
});

test("browser artwork metadata preserves delivery records without verification fields", async (t) => {
  const root = await fixture(t);
  const name = "/launcher/sample-cover.webp";
  const images = { [name]: { width: 8, height: 12, fallback: name, webp: [name], avif: [] } };
  const published = { ...sample, published: true, images };
  const inventory = await fs.realpath(path.join(root, manifestFile));
  await fs.writeFile(inventory, JSON.stringify(published));
  const loaderPath = path.join(root, "scripts/artwork-browser-loader.js");
  await fs.mkdir(path.dirname(loaderPath));
  await fs.copyFile(new URL("../scripts/artwork-browser-loader.js", import.meta.url), loaderPath);
  const { default: artworkBrowserLoader } = await import(pathToFileURL(loaderPath));
  const code = artworkBrowserLoader.call({
    resourcePath: path.join(root, "artwork-data.mjs"),
    addDependency: (dependency) => assert.equal(dependency, inventory),
  });
  const module = await import(`data:text/javascript,${encodeURIComponent(code)}`);
  const browser = module.default;
  assert.deepEqual(browser.images, images);
  assert.deepEqual(browser.files[name], { key: file.key, width: file.width });
  const url = artworkUrl(name, published);
  assert.equal(artworkUrl(name, browser), url);
  assert.equal(artworkPath(url, browser), name);
});

test("plans preserve live mappings and retain exact original bytes outside Git", async (t) => {
  const root = await fixture(t);
  const before = await fs.readFile(path.join(root, manifestFile), "utf8");
  const plan = await planArtwork(root);
  assert.deepEqual(plan.files, sample.files);
  assert.equal(await fs.readFile(path.join(root, manifestFile), "utf8"), before);
  assert.deepEqual(await fs.readFile(path.join(root, ".internal/evidence/artwork-migration/objects", file.key)), bytes);
  assert.deepEqual(await fs.readFile(path.join(root, "scummvm-shell/launcher/sample-cover.webp")), bytes);
});

test("activation refuses missing, corrupt, redirected, or incorrectly described public images", async (t) => {
  const root = await fixture(t);
  await planArtwork(root);
  const before = await fs.readFile(path.join(root, manifestFile), "utf8");
  for (const request of [
    async () => new Response("missing", { status: 404 }),
    async () => response(Buffer.alloc(bytes.length)),
    async () => response(Buffer.concat([bytes, bytes])),
    async () => response(bytes, { "content-type": "text/html" }),
    async () => response(bytes, { "cache-control": "no-store" }),
    async (_url, options) => { assert.equal(options.redirect, "error"); throw new Error("redirect"); },
  ]) {
    await assert.rejects(activateArtwork(root, request));
    assert.equal(await fs.readFile(path.join(root, manifestFile), "utf8"), before);
    assert.deepEqual(await fs.readFile(path.join(root, "scummvm-shell/launcher/sample-cover.webp")), bytes);
  }
  const published = await activateArtwork(root, async () => response());
  assert.equal(published.published, true);
  assert.deepEqual(await fs.readFile(path.join(root, ".cache/artwork", sha256)), bytes);
});

test("retirement preserves saves and notices and rejects changed originals before removing anything", async (t) => {
  const root = await fixture(t);
  await planArtwork(root);
  await fs.mkdir(path.join(root, "scummvm-shell/launcher/skip-intro/sky"), { recursive: true });
  await fs.writeFile(path.join(root, "scummvm-shell/launcher/skip-intro/sky/SKY-VM.000"), "save");
  await fs.mkdir(path.join(root, "scummvm-shell/launcher/notices"));
  await fs.writeFile(path.join(root, "scummvm-shell/launcher/notices/sky.txt"), "credit");
  await assert.rejects(retireArtwork(root, async () => response()), /activate/);
  await activateArtwork(root, async () => response());
  const original = path.join(root, "scummvm-shell/launcher/sample-cover.webp");
  await fs.writeFile(original, "new artwork");
  await assert.rejects(retireArtwork(root, async () => response()), /changed/);
  assert.equal(await fs.readFile(original, "utf8"), "new artwork");
  await fs.writeFile(original, bytes);
  assert.equal(await retireArtwork(root, async () => response()), 1);
  await assert.rejects(fs.access(original), { code: "ENOENT" });
  assert.equal(await fs.readFile(path.join(root, "scummvm-shell/launcher/notices/sky.txt"), "utf8"), "credit");
  assert.equal(await fs.readFile(path.join(root, "scummvm-shell/launcher/skip-intro/sky/SKY-VM.000"), "utf8"), "save");
});

test("activation preserves concurrent storage edits made after planning", async (t) => {
  const root = await fixture(t);
  await planArtwork(root);
  const filename = path.join(root, manifestFile);
  const changed = `${await fs.readFile(filename, "utf8")}\n`;
  await fs.writeFile(filename, changed);
  let calls = 0;
  await assert.rejects(activateArtwork(root, async () => { calls += 1; return response(); }), /changed since planning/);
  assert.equal(calls, 0);
  assert.equal(await fs.readFile(filename, "utf8"), changed);
});

test("published poster variants and social-card projections use the same logical mapping", async (t) => {
  const root = await fixture(t);
  const manifest = { ...sample, published: true, files: {
    ...sample.files,
    "/launcher/responsive/sample-cover-320.webp": { ...file, key: `artwork/${sha256}/sample-cover-320.webp` },
  } };
  await fs.writeFile(path.join(root, manifestFile), JSON.stringify(manifest));
  await fs.writeFile(path.join(root, "data/artwork-renditions.json"), JSON.stringify({ "/launcher/sample-cover.webp": { width: 540, height: 720, widths: [320] } }));
  for (const filename of ["lib/artwork-data.mjs", "lib/artwork-storage.mjs", "lib/social-card-data.mjs", "app/home-shell/poster-images.mjs", "app/home-shell/artwork-image-props.mjs"]) {
    await fs.mkdir(path.dirname(path.join(root, filename)), { recursive: true });
    await fs.copyFile(new URL(`../${filename}`, import.meta.url), path.join(root, filename));
  }
  const { getPosterImageProps } = await import(pathToFileURL(path.join(root, "app/home-shell/poster-images.mjs")));
  const { getSocialCardData } = await import(pathToFileURL(path.join(root, "lib/social-card-data.mjs")));
  const src = `${manifest.origin}/${file.key}`;
  const props = getPosterImageProps(src);
  assert.ok(props.srcSet.includes(`${manifest.origin}/artwork/${sha256}/sample-cover-320.webp 320w`));
  assert.ok(props.srcSet.endsWith(`${src} 540w`));
  assert.equal(getSocialCardData({ posterImage: src }).artwork, "/launcher/sample-cover.webp");
  assert.deepEqual(await readArtworkFile(root, "/launcher/sample-cover.webp"), bytes);
});

test("invalid paths and content keys cannot escape artwork storage", async () => {
  for (const name of ["/launcher/../secret.png", "/launcher/notices/sky.txt", "/logo-nav.png"]) {
    assert.throws(() => validateManifest({ ...sample, files: { [name]: file } }));
  }
  assert.throws(() => validateManifest({ ...sample, files: { "/launcher/sample-cover.webp": { ...file, key: "games/sky.zip" } } }));
  assert.equal(await verifyArtwork(sample, async () => response()), 1);
});

test("fresh checkouts fetch verified build inputs once and reject corrupt remote bytes", async (t) => {
  const root = await fixture(t);
  await fs.writeFile(path.join(root, manifestFile), JSON.stringify({ ...sample, published: true }));
  await fs.unlink(path.join(root, "scummvm-shell/launcher/sample-cover.webp"));
  await assert.rejects(readArtworkFile(root, "/launcher/sample-cover.webp", async () => response(Buffer.alloc(bytes.length))), /checksum/);
  let calls = 0;
  const request = async (url) => { calls += 1; assert.equal(url, `${sample.origin}/${file.key}`); return response(); };
  assert.deepEqual(await readArtworkFile(root, "/launcher/sample-cover.webp", request), bytes);
  assert.deepEqual(await readArtworkFile(root, "/launcher/sample-cover.webp", request), bytes);
  assert.equal(calls, 1);
});
