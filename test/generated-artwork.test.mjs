import assert from "node:assert/strict";
import test from "node:test";
import { buildInventory, validateRegistry } from "../.codex/skills/scummweb_game-assets/scripts/inventory-bundled.mjs";

const asset = "/launcher/example-scummweb-generated-2026-11-05-r1-hero.webp";
const original = "/launcher/example-hero.webp";
const sha256 = "a".repeat(64);
const entry = {
  target: "example", role: "hero", asset, generatedOn: "2026-11-05", generator: "image_gen",
  stage: "preview", references: [{ asset: original }], prompt: "Original-reference hero",
  targetSize: { width: 1600, height: 960 }, deliveryOptimized: false,
  master: { sha256, width: 1619, height: 971 }, output: { sha256, width: 1600, height: 960 },
};
function inventory(options = {}) {
  return buildInventory({ games: [{ target: "example", title: "Example" }],
    presentations: { example: { heroImage: original, posterImage: "/launcher/example-cover.webp" } },
    registry: { version: 1, assets: [entry] }, storage: { origin: "https://images.test", files: {} }, ...options });
}

test("saved generations prevent duplicate work without pretending the original mapping is generated", () => {
  const [hero, cover] = inventory({ localHashes: { [asset]: sha256 } });
  assert.equal(hero.activeGenerated, false);
  assert.equal(hero.needsApply, true);
  assert.equal(hero.needsGeneration, false);
  assert.equal(cover.needsGeneration, true);
  assert.equal(cover.savedCandidates.length, 0);
});

test("active generated provenance follows resolved R2 fallbacks and matching source hashes", () => {
  const [hero] = inventory({
    presentations: { example: { heroImage: "https://images.test/artwork/fallback/image.webp", posterImage: original } },
    storage: { published: true, origin: "https://images.test", files: {
      [asset]: { key: `artwork/${sha256}/image.webp`, sha256 },
      "/launcher/optimized/example.webp": { key: "artwork/fallback/image.webp" },
    }, images: { [asset]: { fallback: "/launcher/optimized/example.webp" } } },
  });
  assert.equal(hero.activeAsset, asset);
  assert.equal(hero.activeGenerated, true);
  assert.equal(hero.activeStage, "preview");
  assert.equal(hero.needsApply, false);
});

test("missing or overwritten candidates and generated-looking filenames do not establish provenance", () => {
  const [missing] = inventory();
  assert.equal(missing.needsGeneration, true);
  assert.deepEqual(missing.unavailableCandidates, [asset]);
  const [changed] = inventory({ localHashes: { [asset]: "b".repeat(64) } });
  assert.equal(changed.needsGeneration, true);
  const [unregistered] = inventory({ registry: { version: 1, assets: [] },
    presentations: { example: { heroImage: asset, posterImage: original } }, localHashes: { [asset]: sha256 } });
  assert.equal(unregistered.activeGenerated, false);
});

test("the registry rejects screenshots and ambiguous duplicate asset records", () => {
  assert.throws(() => validateRegistry({ version: 1, assets: [{ ...entry, role: "screenshot" }] }), /Invalid/);
  assert.throws(() => validateRegistry({ version: 1, assets: [entry, entry] }), /Invalid/);
});

test("ready artwork requires exact target dimensions and completed delivery optimization", () => {
  const ready = { ...entry, stage: "ready" };
  assert.throws(() => validateRegistry({ version: 1, assets: [ready] }), /readiness/);
  assert.throws(() => validateRegistry({ version: 1, assets: [{ ...ready, deliveryOptimized: true,
    output: { ...ready.output, width: 1619 } }] }), /readiness/);
  assert.doesNotThrow(() => validateRegistry({ version: 1, assets: [{ ...ready, deliveryOptimized: true }] }));
});
