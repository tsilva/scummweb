#!/usr/bin/env node

import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import nextPackage from "next/package.json" with { type: "json" };
import reactPackage from "react/package.json" with { type: "json" };
import sharp from "sharp";
import { getBundledGameLibrary } from "../lib/catalog.mjs";
import { getSocialCardData } from "../lib/social-card-data.mjs";
import { getRecognizedGames } from "../app/recognized-games.mjs";

const rootDir = fileURLToPath(new URL("../", import.meta.url));
const generatedName = /^[a-z0-9]+(?:-[a-z0-9]+)*-[a-f0-9]{64}\.png$/;
const hash = (value) => createHash("sha256").update(value).digest("hex");

async function readOptional(filename) {
  try { return await fs.readFile(filename); }
  catch (error) { if (error.code === "ENOENT") return null; throw error; }
}

async function writeAtomic(filename, data) {
  const temporary = `${filename}.${randomUUID()}.tmp`;
  try {
    await fs.writeFile(temporary, data, { flag: "wx" });
    await fs.rename(temporary, filename);
  } finally { await fs.rm(temporary, { force: true }); }
}

async function assertDirectory(directory) {
  await fs.mkdir(directory, { recursive: true });
  if (!(await fs.lstat(directory)).isDirectory()) throw new Error(`Expected directory: ${directory}`);
}

export async function generateSocialCards({
  root = rootDir,
  games,
  render,
  rendererVersion,
} = {}) {
  const outputDir = path.join(root, "public/social-cards");
  const manifestPath = path.join(root, "data/social-cards.json");
  const lockDir = path.join(root, "data/.social-cards.lock");
  await assertDirectory(path.dirname(manifestPath));
  await fs.mkdir(lockDir); // Fail explicitly if another generator is active.
  try {
    await assertDirectory(outputDir);
    if (!games) {
      const library = JSON.parse(await fs.readFile(path.join(root, "scummvm-shell/games.json"), "utf8"));
      games = getRecognizedGames(getBundledGameLibrary(library).games);
    }
    const template = await fs.readFile(new URL("./social-card-template.mjs", import.meta.url));
    rendererVersion ??= hash(Buffer.concat([template, Buffer.from(JSON.stringify({
      next: nextPackage.version, react: reactPackage.version, sharp: sharp.versions.sharp,
    }))]));
    const previousBytes = await readOptional(manifestPath);
    const previous = previousBytes ? JSON.parse(previousBytes) : { version: 1, cards: {} };
    if (previous.version !== 1 || !previous.cards || typeof previous.cards !== "object" || Array.isArray(previous.cards)) {
      throw new Error("Unsupported social card manifest");
    }
    const cards = {};
    const jobs = [];
    // Resolve every input before rendering or pruning anything.
    for (const game of [...games].sort((a, b) => a.slug.localeCompare(b.slug, "en"))) {
      if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(game.slug) || Object.hasOwn(cards, game.slug)) {
        throw new Error(`Invalid or duplicate game slug: ${game.slug}`);
      }
      const card = getSocialCardData(game);
      let artwork = null;
      if (card.artwork) {
        const assetRoot = path.join(root, card.artwork.startsWith("/launcher/") ? "scummvm-shell" : "public");
        const assetPath = path.resolve(assetRoot, `.${decodeURIComponent(card.artwork)}`);
        if (!assetPath.startsWith(`${assetRoot}${path.sep}`)) throw new Error("Artwork escapes asset root");
        artwork = await fs.readFile(assetPath);
      }
      const inputHash = hash(JSON.stringify({ rendererVersion, card, artworkHash: artwork ? hash(artwork) : null }));
      const file = `${game.slug}-${inputHash}.png`;
      const existingPath = path.join(outputDir, file);
      const stat = await fs.lstat(existingPath).catch((error) => {
        if (error.code === "ENOENT") return null;
        throw error;
      });
      if (stat && !stat.isFile()) throw new Error(`Expected regular social card: ${file}`);
      const existing = stat ? await fs.readFile(existingPath) : null;
      const prior = previous.cards[game.slug];
      const reusable = existing && prior?.inputHash === inputHash && prior.file === file && hash(existing) === prior.imageHash;
      cards[game.slug] = reusable ? prior : { file, inputHash };
      if (!reusable) jobs.push({ slug: game.slug, card, artwork, file });
    }
    for (const job of jobs) {
      render ??= (await import("./social-card-template.mjs")).renderSocialCard;
      const image = await render(job.card, job.artwork);
      if (!Buffer.isBuffer(image) || image.length < 24 || image.subarray(0, 8).toString("hex") !== "89504e470d0a1a0a"
        || image.readUInt32BE(16) !== 1200 || image.readUInt32BE(20) !== 630) {
        throw new Error(`Invalid 1200x630 PNG for ${job.slug}`);
      }
      await writeAtomic(path.join(outputDir, job.file), image);
      cards[job.slug].imageHash = hash(image);
    }
    const manifest = `${JSON.stringify({ version: 1, cards }, null, 2)}\n`;
    if (manifest !== previousBytes?.toString()) await writeAtomic(manifestPath, manifest);
    const wanted = new Set(Object.values(cards).map((card) => card.file));
    let removed = 0;
    for (const entry of await fs.readdir(outputDir, { withFileTypes: true })) {
      if (entry.isFile() && generatedName.test(entry.name) && !wanted.has(entry.name)) {
        await fs.unlink(path.join(outputDir, entry.name));
        removed += 1;
      }
    }
    return { generated: jobs.length, reused: games.length - jobs.length, removed };
  } finally { await fs.rmdir(lockDir); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  generateSocialCards().then((result) => {
    console.log(`Social cards: ${result.generated} generated, ${result.reused} unchanged, ${result.removed} removed`);
  }).catch((error) => { console.error(error.message); process.exitCode = 1; });
}
