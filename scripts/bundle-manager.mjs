#!/usr/bin/env node

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import bundleAssets from "../lib/bundle-assets.js";

const { managedPaths, requiredPaths, stalePaths } = bundleAssets;
const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const defaultBundleZip = path.join(rootDir, "bundle", "scummvm-public.zip");
const defaultPublicDir = path.join(rootDir, "public");
const skipNames = new Set([".DS_Store", ".scummvm-bundle.stamp"]);

function usage() {
  throw new Error(
    [
      "usage:",
      "  bundle-manager.mjs restore [bundleZip] [publicDir]",
      "  bundle-manager.mjs archive [publicDir] [bundleZip]",
      "  bundle-manager.mjs sync <sourceDir> <targetDir>",
      "  bundle-manager.mjs validate [directory]",
    ].join("\n")
  );
}

function bundleSignature(filePath) {
  const stats = fs.statSync(filePath);
  return `${stats.size}:${stats.mtimeNs}`;
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
    throw new Error(`Missing scummweb bundle assets in ${label}: ${missingPaths.join(" ")}`);
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

function restoreBundle(nextBundleZip = defaultBundleZip, nextPublicDir = defaultPublicDir) {
  const stampFile = path.join(nextPublicDir, ".scummvm-bundle.stamp");

  if (fs.existsSync(nextBundleZip)) {
    fs.mkdirSync(nextPublicDir, { recursive: true });
    const signature = bundleSignature(nextBundleZip);
    const existingSignature = fs.existsSync(stampFile)
      ? fs.readFileSync(stampFile, "utf8").trim()
      : "";
    let shouldRestore = signature !== existingSignature;

    removeRelativePaths(nextPublicDir, stalePaths);

    if (!shouldRestore) {
      shouldRestore = requiredPaths.some(
        (requiredPath) => !fs.existsSync(path.join(nextPublicDir, requiredPath))
      );
    }

    if (shouldRestore) {
      removeRelativePaths(nextPublicDir, [...managedPaths, ...stalePaths]);
      execFileSync("unzip", ["-q", "-o", nextBundleZip, "-d", nextPublicDir], {
        cwd: rootDir,
        stdio: "inherit",
      });
      removeRelativePaths(nextPublicDir, stalePaths);
      fs.writeFileSync(stampFile, `${signature}\n`);
    }
  }

  try {
    validateManagedDirectory(nextPublicDir, nextPublicDir);
  } catch (error) {
    const bundleNote = fs.existsSync(nextBundleZip)
      ? `Archive exists but did not restore the required files: ${nextBundleZip}`
      : `Archive not found: ${nextBundleZip}`;
    throw new Error(`${error.message}\n${bundleNote}`);
  }
}

function archiveBundle(nextPublicDir = defaultPublicDir, nextBundleZip = defaultBundleZip) {
  if (!fs.existsSync(nextPublicDir)) {
    throw new Error("Missing public/. Run ./scripts/build_bass_web.sh first.");
  }

  validateManagedDirectory(nextPublicDir, nextPublicDir);
  fs.mkdirSync(path.dirname(nextBundleZip), { recursive: true });

  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "scummweb-bundle-"));
  const stagingDir = path.join(tempRoot, "stage");
  const tempZip = `${nextBundleZip}.tmp`;

  fs.mkdirSync(stagingDir, { recursive: true });

  for (const managedPath of managedPaths) {
    copyManagedPath(nextPublicDir, stagingDir, managedPath);
  }

  fs.rmSync(tempZip, { force: true });

  try {
    execFileSync("zip", ["-q", "-r", tempZip, "."], {
      cwd: stagingDir,
      stdio: "inherit",
    });
    fs.renameSync(tempZip, nextBundleZip);
  } finally {
    fs.rmSync(tempRoot, { force: true, recursive: true });
    fs.rmSync(tempZip, { force: true });
  }
}

function validateCommand(directory = defaultPublicDir) {
  validateManagedDirectory(directory, directory);
}

function main() {
  const [command, ...args] = process.argv.slice(2);

  switch (command) {
    case "restore":
      if (args.length > 2) {
        usage();
      }
      restoreBundle(
        args[0] ? path.resolve(rootDir, args[0]) : defaultBundleZip,
        args[1] ? path.resolve(rootDir, args[1]) : defaultPublicDir,
      );
      return;
    case "archive":
      if (args.length > 2) {
        usage();
      }
      archiveBundle(
        args[0] ? path.resolve(rootDir, args[0]) : defaultPublicDir,
        args[1] ? path.resolve(rootDir, args[1]) : defaultBundleZip,
      );
      return;
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
