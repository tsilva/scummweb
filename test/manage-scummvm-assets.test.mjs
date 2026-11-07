import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";

const rootDir = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const managerPath = path.join(rootDir, "scripts", "manage_scummvm_assets.mjs");

function writeFile(targetPath, contents = "test") {
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  fs.writeFileSync(targetPath, contents);
}

function createManagedTree(directory) {
  writeFile(path.join(directory, "audio-start-control.mjs"), "export const installAudioStartControl = () => {};");
  writeFile(path.join(directory, "scummvm.html"), "<html></html>");
  writeFile(path.join(directory, "scummvm.js"), "console.log('boot');");
  writeFile(path.join(directory, "scummvm.wasm"), "wasm");
  writeFile(path.join(directory, "scummvm_fs.js"), "fs");
  writeFile(path.join(directory, "games.json"), '{"primaryTarget":"sky","games":[]}');
  writeFile(path.join(directory, "launcher", "hero.jpg"), "hero");
  writeFile(path.join(directory, "data", "asset.dat"), "asset");
  writeFile(path.join(directory, "data/plugins/libexample.so"), "plugin");
  writeFile(path.join(directory, "doc/COPYING"), "license");
  writeFile(path.join(directory, "doc/COPYRIGHT"), "copyright");
  writeFile(path.join(directory, "doc/scummvm-source.html"), "source offer");
  writeFile(path.join(directory, "doc/scummvm-source.zip"), "source");
  const hash = (name) => createHash("sha256").update(fs.readFileSync(path.join(directory, name))).digest("hex");
  const binaries = ["scummvm.js", "scummvm.wasm", "data/plugins/libexample.so"];
  writeFile(path.join(directory, "source-info.json"), JSON.stringify({
    corresponding_source: {
      page: "/doc/scummvm-source.html",
      archive: "/doc/scummvm-source.zip",
      archive_sha256: hash("doc/scummvm-source.zip"),
      runtime_sha256: Object.fromEntries(binaries.map((name) => [name, hash(name)])),
    },
  }));
}

function runManager(...args) {
  execFileSync("node", [managerPath, ...args], {
    cwd: rootDir,
    stdio: "pipe",
  });
}

test("asset manager sync replaces managed paths and removes stale ones", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "scummweb-assets-sync-"));
  const sourceDir = path.join(tempDir, "dist");
  const targetDir = path.join(tempDir, "public");

  createManagedTree(sourceDir);
  writeFile(path.join(targetDir, "sw.js"), "stale");
  writeFile(path.join(targetDir, "notes.txt"), "keep me");

  runManager("sync", sourceDir, targetDir);

  assert.equal(fs.existsSync(path.join(targetDir, "scummvm.html")), true);
  assert.equal(fs.existsSync(path.join(targetDir, "launcher", "hero.jpg")), true);
  assert.equal(fs.readFileSync(path.join(targetDir, "doc/scummvm-source.zip"), "utf8"), "source");
  assert.equal(fs.existsSync(path.join(targetDir, "sw.js")), false);
  assert.equal(fs.readFileSync(path.join(targetDir, "notes.txt"), "utf8"), "keep me");
});

test("asset manager rejects binaries and source archives that differ from the source offer", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "scummweb-assets-source-offer-"));
  try {
    for (const file of ["scummvm.wasm", "data/plugins/libexample.so", "doc/scummvm-source.zip"]) {
      createManagedTree(directory);
      writeFile(path.join(directory, file), "different");
      assert.throws(() => runManager("validate", directory), /ScummVM source offer checksum mismatch/);
    }
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("asset manager validate accepts managed trees and rejects incomplete ones", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "scummweb-assets-validate-"));
  const validDir = path.join(tempDir, "valid");
  const invalidDir = path.join(tempDir, "invalid");

  createManagedTree(validDir);
  createManagedTree(invalidDir);
  fs.rmSync(path.join(invalidDir, "scummvm.js"));

  runManager("validate", validDir);

  assert.throws(
    () => runManager("validate", invalidDir),
    /Missing required managed ScummVM assets/
  );
});
