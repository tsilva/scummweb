#!/usr/bin/env node

import fs from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import assetConfig from "../lib/scummvm-shell-assets.js";

const { managedPaths, requiredPaths, stalePaths, sourceOfferPage, sourceOfferArchive } = assetConfig;
const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const defaultShellDir = path.join(rootDir, "scummvm-shell");
const skipNames = new Set([".DS_Store"]);

function usage() {
  throw new Error(
    [
      "usage:",
      "  manage_scummvm_assets.mjs sync <sourceDir> <targetDir>",
      "  manage_scummvm_assets.mjs validate [directory]",
      "",
      "defaults:",
      "  validate => scummvm-shell/",
    ].join("\n")
  );
}

function removeRelativePaths(baseDir, relativePaths) {
  for (const relativePath of relativePaths) {
    fs.rmSync(path.join(baseDir, relativePath), { force: true, recursive: true });
  }
}

function listMissingRequiredPaths(directory) {
  return requiredPaths.filter((relativePath) => !fs.existsSync(path.join(directory, relativePath)));
}

function validateManagedDirectory(directory, label = directory) {
  const missingPaths = listMissingRequiredPaths(directory);

  if (missingPaths.length > 0) {
    throw new Error(`Missing required managed ScummVM assets in ${label}: ${missingPaths.join(" ")}`);
  }

  const { corresponding_source: offer } = JSON.parse(fs.readFileSync(path.join(directory, "source-info.json"), "utf8"));
  if (offer?.page !== sourceOfferPage || offer.archive !== sourceOfferArchive) {
    throw new Error(`Missing ScummVM source offer in ${label}`);
  }

  const pluginDir = "data/plugins";
  const plugins = fs.readdirSync(path.join(directory, pluginDir)).filter((name) => name.endsWith(".so"));
  const binaries = ["scummvm.js", "scummvm.wasm", ...plugins.map((name) => `${pluginDir}/${name}`)];
  if (!plugins.length || Object.keys(offer.runtime_sha256 ?? {}).length !== binaries.length) {
    throw new Error(`Incomplete ScummVM binary checksums in ${label}`);
  }

  for (const [relativePath, expected] of [
    [sourceOfferArchive.slice(1), offer.archive_sha256],
    ...binaries.map((name) => [name, offer.runtime_sha256[name]]),
  ]) {
    const hash = createHash("sha256").update(fs.readFileSync(path.join(directory, relativePath))).digest("hex");
    if (hash !== expected) {
      throw new Error(`ScummVM source offer checksum mismatch for ${relativePath} in ${label}. Rebuild the full runtime and its source offer.`);
    }
  }
}

function shouldCopyEntry(sourcePath) {
  return !skipNames.has(path.basename(sourcePath));
}

function copyManagedPath(sourceDir, targetDir, relativePath) {
  const sourcePath = path.join(sourceDir, relativePath);
  const targetPath = path.join(targetDir, relativePath);

  if (!fs.existsSync(sourcePath)) {
    return;
  }

  fs.cpSync(sourcePath, targetPath, {
    dereference: true,
    filter: shouldCopyEntry,
    force: true,
    recursive: true,
  });
}

function syncManagedAssets(sourceDir, targetDir) {
  fs.mkdirSync(targetDir, { recursive: true });
  removeRelativePaths(targetDir, [...managedPaths, ...stalePaths]);

  for (const managedPath of managedPaths) {
    copyManagedPath(sourceDir, targetDir, managedPath);
  }
}

function validateCommand(directory = defaultShellDir) {
  validateManagedDirectory(directory, directory);
}

function main() {
  const [command, ...args] = process.argv.slice(2);

  switch (command) {
    case "sync":
      if (args.length !== 2) {
        usage();
      }
      syncManagedAssets(path.resolve(rootDir, args[0]), path.resolve(rootDir, args[1]));
      return;
    case "validate":
      if (args.length > 1) {
        usage();
      }
      validateCommand(args[0] ? path.resolve(rootDir, args[0]) : defaultShellDir);
      return;
    default:
      usage();
  }
}

main();
