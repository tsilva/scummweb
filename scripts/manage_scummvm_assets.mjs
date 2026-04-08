#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import assetConfig from "../lib/scummvm-shell-assets.js";

const { managedPaths, requiredPaths, stalePaths } = assetConfig;
const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const defaultPublicDir = path.join(rootDir, "public");
const skipNames = new Set([".DS_Store"]);

function usage() {
  throw new Error(
    [
      "usage:",
      "  manage_scummvm_assets.mjs sync <sourceDir> <targetDir>",
      "  manage_scummvm_assets.mjs validate [directory]",
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

function validateCommand(directory = defaultPublicDir) {
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
      validateCommand(args[0] ? path.resolve(rootDir, args[0]) : defaultPublicDir);
      return;
    default:
      usage();
  }
}

main();
