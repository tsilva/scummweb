import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import test from "node:test";
import "next/dist/server/node-environment.js";
import proxyTesting from "next/experimental/testing/server.js";
import sharp from "sharp";
import { generateSocialCards } from "../scripts/generate-social-cards.mjs";
import { getSocialCardData } from "../lib/social-card-data.mjs";
import { getGameSocialCardPath } from "../lib/social-card-paths.mjs";
import { getBundledGameLibrary } from "../lib/catalog.mjs";
import { getRecognizedGames } from "../app/recognized-games.mjs";
import manifest from "../data/social-cards.json" with { type: "json" };
import library from "../scummvm-shell/games.json" with { type: "json" };
import swc from "next/dist/build/swc/index.js";
import { runInNewContext } from "node:vm";

const { unstable_doesMiddlewareMatch } = proxyTesting;

const png = await sharp({ create: { width: 1200, height: 630, channels: 3, background: "#123456" } }).png().toBuffer();
const game = { slug: "sample", displayTitle: "Sample", summary: "A game", spotlightImage: "/launcher/cover.webp?v=deployment-one" };

async function fixture(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "scummweb-social-cards-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  await fs.mkdir(path.join(root, "scummvm-shell/launcher"), { recursive: true });
  await fs.writeFile(path.join(root, "scummvm-shell/launcher/cover.webp"), "original artwork");
  let calls = 0;
  const run = (games = [game], extra = {}) => generateSocialCards({
    root, games, rendererVersion: "template-one", render: async () => { calls += 1; return png; }, ...extra,
  });
  const readManifest = async () => JSON.parse(await fs.readFile(path.join(root, "data/social-cards.json"), "utf8"));
  return { root, run, readManifest, calls: () => calls };
}

test("unchanged copy and artwork reuse PNGs across builds and deployment versions without rewriting files", async (t) => {
  const f = await fixture(t);
  assert.deepEqual(await f.run(), { generated: 1, reused: 0, removed: 0 });
  const before = await f.readManifest();
  const filename = path.join(f.root, "public/social-cards", before.cards.sample.file);
  const manifestPath = path.join(f.root, "data/social-cards.json");
  const oldDate = new Date("2020-01-01");
  await fs.utimes(filename, oldDate, oldDate);
  await fs.utimes(manifestPath, oldDate, oldDate);
  assert.deepEqual(await f.run([{ ...game, spotlightImage: "/launcher/cover.webp?v=deployment-two", playHref: "/changed-play-url", skipIntro: true }]),
    { generated: 0, reused: 1, removed: 0 });
  assert.equal(f.calls(), 1);
  assert.deepEqual(await f.readManifest(), before);
  assert.equal((await fs.stat(filename)).mtimeMs, oldDate.getTime());
  assert.equal((await fs.stat(manifestPath)).mtimeMs, oldDate.getTime());
});

test("copy, artwork bytes at the same path, and template changes invalidate only the affected cards", async (t) => {
  const f = await fixture(t);
  const second = { slug: "second", displayTitle: "Another game" };
  await f.run([game, second]);
  const original = await f.readManifest();
  const revised = { ...game, summary: "Revised copy" };
  assert.deepEqual(await f.run([revised, second]), { generated: 1, reused: 1, removed: 1 });
  let current = await f.readManifest();
  assert.notEqual(current.cards.sample.file, original.cards.sample.file);
  assert.deepEqual(current.cards.second, original.cards.second);
  await fs.writeFile(path.join(f.root, "scummvm-shell/launcher/cover.webp"), "changed artwork");
  assert.deepEqual(await f.run([revised, second]), { generated: 1, reused: 1, removed: 1 });
  const changed = await f.readManifest();
  assert.notEqual(changed.cards.sample.file, current.cards.sample.file);
  assert.deepEqual(await f.run([revised, second], { rendererVersion: "template-two" }), { generated: 2, reused: 0, removed: 2 });
});

test("new games get cards and obsolete games and earlier revisions are pruned only within generated assets", async (t) => {
  const f = await fixture(t);
  await f.run();
  const original = await f.readManifest();
  const dir = path.join(f.root, "public/social-cards");
  await fs.writeFile(path.join(dir, "keep.txt"), "unmanaged");
  const second = { slug: "second", displayTitle: "New game" };
  assert.deepEqual(await f.run([game, second]), { generated: 1, reused: 1, removed: 0 });
  assert.deepEqual(await f.run([second]), { generated: 0, reused: 1, removed: 1 });
  assert.deepEqual(Object.keys((await f.readManifest()).cards), ["second"]);
  await assert.rejects(fs.access(path.join(dir, original.cards.sample.file)), { code: "ENOENT" });
  assert.equal(await fs.readFile(path.join(dir, "keep.txt"), "utf8"), "unmanaged");
  assert.deepEqual(await f.run([]), { generated: 0, reused: 0, removed: 1 });
});

test("deleted and corrupted PNGs are repaired even when their inputs have not changed", async (t) => {
  const f = await fixture(t);
  await f.run();
  const filename = path.join(f.root, "public/social-cards", (await f.readManifest()).cards.sample.file);
  await fs.writeFile(filename, "corrupted");
  assert.deepEqual(await f.run(), { generated: 1, reused: 0, removed: 0 });
  assert.deepEqual(await fs.readFile(filename), png);
  await fs.unlink(filename);
  assert.deepEqual(await f.run(), { generated: 1, reused: 0, removed: 0 });
});

test("failed inputs and failed renders preserve the last valid manifest and cards", async (t) => {
  const f = await fixture(t);
  await f.run();
  const before = await f.readManifest();
  await assert.rejects(f.run([{ ...game, spotlightImage: "/launcher/missing.webp" }]), { code: "ENOENT" });
  await assert.rejects(f.run([{ ...game, summary: "New copy" }], { render: async () => { throw new Error("render failed"); } }), /render failed/);
  await assert.rejects(f.run([{ ...game, summary: "New copy" }], { render: async () => Buffer.from("bad PNG") }), /Invalid 1200x630 PNG/);
  assert.deepEqual(await f.readManifest(), before);
  await fs.access(path.join(f.root, "public/social-cards", before.cards.sample.file));
  assert.deepEqual(await f.run(), { generated: 0, reused: 1, removed: 0 });
});

test("invalid slugs, nonlocal artwork and symlink outputs fail without writing through them", async (t) => {
  const f = await fixture(t);
  await assert.rejects(f.run([{ ...game, slug: "../escape" }]), /Invalid or duplicate/);
  await assert.rejects(f.run([game, game]), /Invalid or duplicate/);
  await assert.rejects(f.run([{ ...game, spotlightImage: "https://example.com/art.webp" }]), /local asset/);
  await f.run();
  const filename = path.join(f.root, "public/social-cards", (await f.readManifest()).cards.sample.file);
  const outside = path.join(f.root, "keep.png");
  await fs.writeFile(outside, "do not change");
  await fs.unlink(filename);
  await fs.symlink(outside, filename);
  await assert.rejects(f.run(), /Expected regular social card/);
  assert.equal(await fs.readFile(outside, "utf8"), "do not change");
});

test("the real renderer produces a complete PNG offline from local WebP artwork", async (t) => {
  const f = await fixture(t);
  const artwork = await sharp({ create: { width: 32, height: 32, channels: 3, background: "#336699" } }).webp().toBuffer();
  await fs.writeFile(path.join(f.root, "scummvm-shell/launcher/cover.webp"), artwork);
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => { throw new Error("Rendering must not fetch remote resources"); };
  try {
    await generateSocialCards({ root: f.root, games: [game] });
  } finally { globalThis.fetch = originalFetch; }
  const filename = path.join(f.root, "public/social-cards", (await f.readManifest()).cards.sample.file);
  const metadata = await sharp(await fs.readFile(filename)).metadata();
  assert.equal(metadata.format, "png");
  assert.equal(metadata.width, 1200);
  assert.equal(metadata.height, 630);
});

test("every recognized game advertises a static asset, with static rewrites for both legacy URLs", async () => {
  await generateSocialCards();
  const games = getRecognizedGames(getBundledGameLibrary(library).games);
  assert.deepEqual(Object.keys(manifest.cards).sort(), games.map((game) => game.slug).sort());
  const require = createRequire(import.meta.url);
  const config = require("../next.config.js");
  const rewrites = await config.rewrites();
  for (const game of games) {
    const imagePath = getGameSocialCardPath(game);
    assert.match(imagePath, /^\/social-cards\/[a-z0-9-]+-[a-f0-9]{64}\.png$/);
    await fs.access(new URL(`../public${imagePath}`, import.meta.url));
    for (const suffix of ["social-card.png", "opengraph-image"]) {
      assert.equal(rewrites.find((rewrite) => rewrite.source === `/${game.slug}/${suffix}`)?.destination, imagePath);
    }
  }
  assert.throws(() => getGameSocialCardPath({ slug: "no-such-game" }), /Missing social card/);
  for (const route of ["app/[gameSlug]/social-card.png/route.js", "app/[gameSlug]/opengraph-image.js"]) {
    await assert.rejects(fs.access(new URL(`../${route}`, import.meta.url)), { code: "ENOENT" });
  }
});

test("the card projection strips deployment query strings and retains all displayed copy", () => {
  const card = getSocialCardData(game);
  assert.equal(card.artwork, "/launcher/cover.webp");
  assert.equal(getSocialCardData({ ...game, heroImage: "/launcher/hero.webp?v=deployment-one" }).artwork,
    "/launcher/hero.webp");
  for (const [field, source] of [["title", "displayTitle"], ["summary", "summary"], ["eyebrow", "eyebrow"],
    ["year", "year"], ["badge", "badge"], ["genre", "genre"], ["studio", "studio"]]) {
    assert.equal(getSocialCardData({ ...game, [source]: "changed" })[field], "changed");
  }
});

test("social cards, game pages and assets bypass Proxy while the runtime entry keeps its legacy route", async () => {
  const moduleUrl = new URL("../proxy.js", import.meta.url);
  const source = await fs.readFile(moduleUrl, "utf8");
  await swc.loadBindings();
  const { code } = await swc.transform(source, {
    filename: moduleUrl.pathname, swcrc: false, configFile: false,
    module: { type: "commonjs" }, jsc: { parser: { syntax: "ecmascript" } },
  });
  const compiled = { exports: {} };
  runInNewContext(code, { module: compiled, exports: compiled.exports, require: createRequire(moduleUrl) });
  const matches = (url) => unstable_doesMiddlewareMatch({ config: compiled.exports.config, nextConfig: {}, url });
  assert.equal(matches("/social-cards/sample-abc.png"), false);
  assert.equal(matches("/beneath-a-steel-sky/social-card.png?v=old-deployment"), false);
  assert.equal(matches("/beneath-a-steel-sky/opengraph-image?oldhash"), false);
  for (const url of ["/", "/beneath-a-steel-sky", "/beneath-a-steel-sky/play", "/launcher/sky-cover.webp?v=1", "/data/plugins/libsky.so?v=1", "/_next/static/chunks/app.js"]) {
    assert.equal(matches(url), false, url);
  }
  assert.equal(matches("/scummvm.html?localGame=1"), true);
  assert.equal(matches("/scummvm.html"), true);
});
