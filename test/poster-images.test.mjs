import assert from "node:assert/strict";
import test from "node:test";
import sharp from "sharp";
import renditions from "../data/artwork-renditions.json" with { type: "json" };
import { getPosterImageProps } from "../app/home-shell/poster-images.mjs";
import { readArtworkFile } from "../scripts/artwork-files.mjs";
import { fileURLToPath } from "node:url";
import { artworkUrl } from "../lib/artwork-storage.mjs";

test("poster candidates preserve asset versions, original fallback and intrinsic geometry", () => {
  const src = "/launcher/monkey-demo-cover.webp?v=release-1";
  const props = getPosterImageProps(src);
  assert.equal(props.src, src);
  assert.ok(props.srcSet.includes(`${artworkUrl("/launcher/responsive/monkey-demo-cover-320.webp?v=release-1")} 320w`));
  assert.ok(props.srcSet.endsWith(`${src} ${props.width}w`));
  assert.ok(props.width > 0 && props.height > 0);
  assert.equal(getPosterImageProps(src, true).sizes, "100vw");
});

test("remote, blob and unknown artwork keep their direct source without a proxy", () => {
  for (const src of [undefined, "blob:https://example.test/art", "https://games.example.test/art.webp", "/launcher/new-cover.webp"]) {
    assert.deepEqual(getPosterImageProps(src), { src });
  }
});

test("every generated poster is smaller than its original, with truthful width descriptors", async () => {
  for (const [src, image] of Object.entries(renditions)) {
    const source = await readArtworkFile(fileURLToPath(new URL("../", import.meta.url)), src);
    const name = src.split("/").at(-1).slice(0, -5);
    for (const width of image.widths) {
      const filename = new URL(`../scummvm-shell/launcher/responsive/${name}-${width}.webp`, import.meta.url);
      const buffer = await readArtworkFile(fileURLToPath(new URL("../", import.meta.url)), `/launcher/responsive/${name}-${width}.webp`);
      const metadata = await sharp(buffer).metadata();
      assert.equal(metadata.width, width, filename.pathname);
      assert.ok(width < image.width, "never upscale artwork");
      assert.ok(buffer.length < source.length, "never ship a larger rendition");
      assert.ok(Math.abs(metadata.height / metadata.width - image.height / image.width) < 0.01, "preserve the artwork crop");
    }
  }
});
