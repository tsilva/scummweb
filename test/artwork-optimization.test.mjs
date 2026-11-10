import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import sharp from "sharp";
import { optimizeArtwork, psnr } from "../scripts/optimize-artwork.mjs";
import { planArtwork, validateManifest } from "../scripts/artwork-storage.mjs";
import { artworkPath, artworkUrl } from "../lib/artwork-storage.mjs";
import { getArtworkImageProps, getPosterSizes } from "../app/home-shell/artwork-image-props.mjs";
import { resolveArtworkWorkspace } from "../scripts/artwork-workspace.mjs";

const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");

test("optimization preserves screenshot pixels, originals, active delivery and honest variant dimensions", async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "scummweb-optimize-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const source = await sharp({ create: { width: 640, height: 480, channels: 3, background: "#123456" } }).png().toBuffer();
  const sha256 = digest(source);
  const sourceName = "/launcher/example-shot-1.png";
  const storage = { version: 1, published: true, origin: "https://scummvm-games.tsilva.eu", files: {
    [sourceName]: { key: `artwork/${sha256}/example-shot-1.png`, sha256, bytes: source.length, contentType: "image/png", width: 640, height: 480 },
  } };
  await fs.mkdir(path.join(root, "data"), { recursive: true });
  await fs.mkdir(path.join(root, ".cache/artwork"), { recursive: true });
  const before = JSON.stringify(storage);
  await fs.writeFile(path.join(root, "data/artwork-storage.json"), before);
  await fs.writeFile(path.join(root, ".cache/artwork", sha256), source);
  const { images, stats } = await optimizeArtwork({ root, avif: false });
  assert.equal(stats.sources, 1);
  assert.equal(await fs.readFile(path.join(root, "data/artwork-storage.json"), "utf8"), before);
  const image = images[sourceName];
  assert.deepEqual(image.avif, []);
  const converted = await fs.readFile(path.join(root, ".internal/evidence/artwork-migration/inputs", image.fallback.slice(1)));
  assert.deepEqual(await sharp(converted).raw().toBuffer(), await sharp(source).raw().toBuffer());
  const planned = await planArtwork(root);
  assert.equal(planned.published, false);
  assert.deepEqual(planned.files[sourceName], storage.files[sourceName]);
  assert.deepEqual(planned.images, images);
  for (const name of image.webp) {
    const file = planned.files[name];
    const metadata = await sharp(await fs.readFile(path.join(root, ".internal/evidence/artwork-migration/inputs", name.slice(1)))).metadata();
    assert.equal(file.width, metadata.width);
    assert.equal(file.height, metadata.height);
    assert.ok(file.width <= 640 && file.height <= 480);
  }
  await fs.writeFile(path.join(root, "data/artwork-storage.json"), `${before}\n`);
  await assert.rejects(planArtwork(root), /changed after optimization/);
});

test("format switching preserves source identity, provides WebP fallback and labels candidates truthfully", () => {
  const entry = (key, width, height, contentType) => ({ key, width, height, contentType });
  const manifest = { published: true, origin: "https://images.example.test", files: {
    "/launcher/example-shot.png": entry("artwork/original/example-shot.png", 960, 720, "image/png"),
    "/launcher/optimized/example-shot.webp": entry("artwork/webp/example-shot.webp", 960, 720, "image/webp"),
    "/launcher/responsive/example-shot-480.webp": entry("artwork/small/example-shot-480.webp", 480, 360, "image/webp"),
    "/launcher/optimized/example-shot.avif": entry("artwork/avif/example-shot.avif", 960, 720, "image/avif"),
    "/launcher/responsive/example-shot-480.avif": entry("artwork/avif-small/example-shot-480.avif", 480, 360, "image/avif"),
  }, images: {
    "/launcher/example-shot.png": { width: 960, height: 720, fallback: "/launcher/optimized/example-shot.webp",
      webp: ["/launcher/responsive/example-shot-480.webp", "/launcher/optimized/example-shot.webp"], avif: ["/launcher/responsive/example-shot-480.avif", "/launcher/optimized/example-shot.avif"] },
  } };
  const src = artworkUrl("/launcher/example-shot.png", manifest);
  assert.equal(src, "https://images.example.test/artwork/webp/example-shot.webp");
  assert.equal(artworkPath(src, manifest), "/launcher/example-shot.png");
  const props = getArtworkImageProps(src, "gallery", manifest);
  assert.equal(props.src, src);
  assert.equal(props.srcSet, "https://images.example.test/artwork/small/example-shot-480.webp 480w, https://images.example.test/artwork/webp/example-shot.webp 960w");
  assert.equal(props.avifSrcSet, "https://images.example.test/artwork/avif-small/example-shot-480.avif 480w, https://images.example.test/artwork/avif/example-shot.avif 960w");
  manifest.images["/launcher/example-shot.png"].avif.shift();
  assert.equal(getArtworkImageProps(src, "gallery", manifest).avifSrcSet, undefined, "incomplete format coverage must keep the sharp WebP candidates");
  assert.deepEqual(getArtworkImageProps("blob:import", "gallery", manifest), { src: "blob:import" });
});

test("poster source sizing follows the library grid and the contained cover's width", () => {
  const sizes = getPosterSizes(2 / 3, 9);
  assert.ok(sizes.includes("(max-width: 48rem) calc((100vw - 5.5rem) / 4 * 0.925)"));
  assert.ok(sizes.endsWith("calc((min(100vw, 94rem) - 10.5rem) / 5 * 0.925)"));
  const sparseSizes = getPosterSizes(1, 2);
  assert.ok(sparseSizes.includes("(max-width: 63.999rem) calc((100vw - 7.5rem) / 2 * 1.04)"));
  assert.ok(sparseSizes.endsWith("calc((min(100vw, 94rem) - 10.5rem) / 5 * 1.04)"));
});

test("quality metric distinguishes identical and damaged pixels", () => {
  assert.equal(psnr(Buffer.from([0, 127, 255]), Buffer.from([0, 127, 255])), Infinity);
  assert.ok(psnr(Buffer.from([0, 127, 255]), Buffer.from([255, 0, 0])) < 5);
  assert.throws(() => psnr(Buffer.from([0]), Buffer.from([0, 1])), /dimensions/);
});

test("parallel artwork operations keep plans in explicit private workspace names", () => {
  assert.equal(resolveArtworkWorkspace("artwork-optimization"), ".internal/evidence/artwork-optimization");
  for (const value of ["../other", "/tmp/assets", "a/b", "", "with spaces"]) assert.throws(() => resolveArtworkWorkspace(value));
});
