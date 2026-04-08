import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { execFileSync } from "node:child_process";

const rootDir = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const bundleManagerPath = path.join(rootDir, "scripts", "bundle-manager.mjs");

function writeFile(targetPath, contents = "test") {
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  fs.writeFileSync(targetPath, contents);
}

function createManagedTree(directory) {
  writeFile(path.join(directory, "scummvm.html"), "<html></html>");
  writeFile(path.join(directory, "scummvm.js"), "console.log('boot');");
  writeFile(path.join(directory, "scummvm.wasm"), "wasm");
  writeFile(path.join(directory, "scummvm_fs.js"), "fs");
  writeFile(path.join(directory, "games.json"), '{"primaryTarget":"sky","games":[]}');
  writeFile(path.join(directory, "source-info.json"), '{"generated_at_utc":"2026-01-01T00:00:00Z"}');
  writeFile(path.join(directory, "launcher", "hero.jpg"), "hero");
  writeFile(path.join(directory, "data", "asset.dat"), "asset");
  writeFile(path.join(directory, "doc", "readme.txt"), "readme");
}

function runBundleManager(...args) {
  execFileSync("node", [bundleManagerPath, ...args], {
    cwd: rootDir,
    stdio: "pipe",
  });
}

test("bundle manager sync replaces managed paths and removes stale ones", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "scummweb-bundle-sync-"));
  const sourceDir = path.join(tempDir, "dist");
  const targetDir = path.join(tempDir, "public");

  createManagedTree(sourceDir);
  writeFile(path.join(targetDir, "sw.js"), "stale");
  writeFile(path.join(targetDir, "notes.txt"), "keep me");

  runBundleManager("sync", sourceDir, targetDir);

  assert.equal(fs.existsSync(path.join(targetDir, "scummvm.html")), true);
  assert.equal(fs.existsSync(path.join(targetDir, "launcher", "hero.jpg")), true);
  assert.equal(fs.existsSync(path.join(targetDir, "sw.js")), false);
  assert.equal(fs.readFileSync(path.join(targetDir, "notes.txt"), "utf8"), "keep me");
});

test("bundle manager archive, validate, and restore round-trip managed assets", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "scummweb-bundle-archive-"));
  const sourcePublicDir = path.join(tempDir, "public");
  const restoredPublicDir = path.join(tempDir, "restored");
  const bundleZipPath = path.join(tempDir, "bundle", "scummvm-public.zip");

  createManagedTree(sourcePublicDir);

  runBundleManager("validate", sourcePublicDir);
  runBundleManager("archive", sourcePublicDir, bundleZipPath);

  writeFile(path.join(restoredPublicDir, "source.html"), "stale");
  runBundleManager("restore", bundleZipPath, restoredPublicDir);

  assert.equal(fs.existsSync(path.join(restoredPublicDir, "scummvm.html")), true);
  assert.equal(fs.existsSync(path.join(restoredPublicDir, "launcher", "hero.jpg")), true);
  assert.equal(fs.existsSync(path.join(restoredPublicDir, "source.html")), false);
  assert.equal(fs.existsSync(path.join(restoredPublicDir, ".scummvm-bundle.stamp")), true);

  fs.rmSync(path.join(restoredPublicDir, "scummvm.js"));
  runBundleManager("restore", bundleZipPath, restoredPublicDir);
  assert.equal(fs.existsSync(path.join(restoredPublicDir, "scummvm.js")), true);
});
