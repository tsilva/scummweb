#!/usr/bin/env node
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { getGamePresentation } from "../../../../app/game-presentation.js";
import { artworkPath } from "../../../../lib/artwork-storage.mjs";

const rootDir = fileURLToPath(new URL("../../../../", import.meta.url));
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");

export function validateRegistry(registry) {
  if (registry.version !== 1 || !Array.isArray(registry.assets)) throw new Error("Invalid generated-artwork registry");
  const seen = new Set();
  for (const entry of registry.assets) {
    if (!/^[a-z0-9][a-z0-9-]*$/.test(entry.target) || !["hero", "cover"].includes(entry.role)
      || !/^\/launcher\/[a-z0-9-]+\.webp$/.test(entry.asset) || seen.has(entry.asset)
      || !/^\d{4}-\d{2}-\d{2}$/.test(entry.generatedOn)
      || !["preview", "ready"].includes(entry.stage) || !entry.generator
      || typeof entry.deliveryOptimized !== "boolean"
      || !Array.isArray(entry.references) || !entry.references.length
      || !(entry.prompt || entry.promptSummary)) throw new Error(`Invalid generated-artwork entry: ${entry.asset}`);
    for (const image of [entry.master, entry.output]) {
      if (!image || !/^[a-f0-9]{64}$/.test(image.sha256)
        || !Number.isSafeInteger(image.width) || image.width < 1
        || !Number.isSafeInteger(image.height) || image.height < 1) throw new Error(`Invalid generated-artwork image: ${entry.asset}`);
    }
    if (!entry.targetSize || !Number.isSafeInteger(entry.targetSize.width) || entry.targetSize.width < 1
      || !Number.isSafeInteger(entry.targetSize.height) || entry.targetSize.height < 1
      || (entry.stage === "ready" && (!entry.deliveryOptimized
        || entry.output.width !== entry.targetSize.width || entry.output.height !== entry.targetSize.height))) {
      throw new Error(`Generated artwork has not passed readiness gates: ${entry.asset}`);
    }
    seen.add(entry.asset);
  }
  return registry;
}

// Explicit hashes prevent a similarly named or subsequently overwritten image
// from being treated as one of our known generations.
export function buildInventory({ games, presentations, registry, storage, localHashes = {} }) {
  validateRegistry(registry);
  const available = (entry) => {
    const local = localHashes[entry.asset];
    return local !== undefined ? local === entry.output.sha256
      : storage.published === true && storage.files[entry.asset]?.sha256 === entry.output.sha256;
  };
  return games.flatMap((game) => ["hero", "cover"].map((role) => {
    const raw = presentations[game.target][role === "hero" ? "heroImage" : "posterImage"];
    const activeAsset = artworkPath(raw?.split(/[?#]/, 1)[0], storage);
    const candidates = registry.assets.filter((entry) => entry.target === game.target && entry.role === role);
    const applied = candidates.find((entry) => entry.asset === activeAsset && available(entry));
    const saved = candidates.filter(available);
    return {
      target: game.target, title: game.title, role, activeAsset,
      activeGenerated: Boolean(applied), activeStage: applied?.stage || null,
      savedCandidates: saved.map(({ asset, generatedOn, stage }) => ({ asset, generatedOn, stage })),
      unavailableCandidates: candidates.filter((entry) => !available(entry)).map(({ asset }) => asset),
      needsGeneration: !applied && !saved.length,
      needsApply: !applied && Boolean(saved.length),
    };
  }));
}

export async function inventoryBundled(root = rootDir) {
  const read = async (file) => JSON.parse(await fs.readFile(path.join(root, file), "utf8"));
  const [catalog, registry, storage] = await Promise.all([
    read("scummvm-shell/games.json"), read("data/generated-artwork.json"), read("data/artwork-storage.json"),
  ]);
  validateRegistry(registry);
  const localHashes = {};
  for (const entry of registry.assets) {
    // Active local inputs take precedence; a private candidate is only a copy.
    for (const name of [`scummvm-shell${entry.asset}`, `.internal/evidence/generated-artwork/${path.basename(entry.asset)}`]) {
      const bytes = await fs.readFile(path.join(root, name)).catch((error) => {
        if (error.code !== "ENOENT") throw error;
        return null;
      });
      if (bytes) { localHashes[entry.asset] = hash(bytes); break; }
    }
  }
  const presentations = Object.fromEntries(catalog.games.map((game) => [game.target, getGamePresentation(game)]));
  return buildInventory({ games: catalog.games, presentations, registry, storage, localHashes });
}

async function main(args) {
  let role = "all";
  let mode;
  for (let i = 0; i < args.length; i += 1) {
    if (args[i] === "--role") {
      role = args[++i];
      if (!["all", "hero", "cover"].includes(role)) throw new Error("Use --role all|hero|cover");
    } else if (["--missing", "--needs-apply"].includes(args[i]) && !mode) mode = args[i];
    else throw new Error("Usage: inventory-bundled.mjs [--role all|hero|cover] [--missing|--needs-apply]");
  }
  const rows = await inventoryBundled();
  console.log(JSON.stringify(rows.filter((row) => (role === "all" || row.role === role)
    && (!mode || (mode === "--missing" ? row.needsGeneration : row.needsApply))), null, 2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main(process.argv.slice(2)).catch((error) => { console.error(error.message); process.exitCode = 1; });
}
