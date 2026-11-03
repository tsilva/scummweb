import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import assetConfig from "../lib/scummvm-shell-assets.js";

test("required shell asset paths are managed and versioned matchers cover expected routes", () => {
  const {
    isVersionedAsset,
    managedPaths,
    requiredPaths,
    versionedAssetMatchers,
  } = assetConfig;

  for (const requiredPath of requiredPaths) {
    assert.ok(managedPaths.includes(requiredPath), `${requiredPath} should stay in managedPaths`);
  }

  assert.ok(versionedAssetMatchers.includes("/launcher/:path*"));
  assert.equal(isVersionedAsset("/launcher/poster.png"), true);
  assert.equal(isVersionedAsset("/scummvm.js"), true);
  assert.equal(isVersionedAsset("/unmanaged.txt"), false);
});

test("the bundled catalog engines and SCUMM are indexed WebAssembly plugins", () => {
  const shell = new URL("../scummvm-shell/", import.meta.url);
  const catalog = JSON.parse(fs.readFileSync(new URL("games.json", shell)));
  const { plugins } = JSON.parse(fs.readFileSync(new URL("data/index.json", shell)));
  const engines = new Set(["scumm", ...catalog.games.map(({ engineId }) => engineId)]);

  for (const engine of engines) {
    const name = `lib${engine}.so`;
    const module = fs.readFileSync(new URL(`data/plugins/${name}`, shell));
    assert.equal(plugins[name], module.length, `${name} must match the filesystem index`);
    assert.equal(module.subarray(0, 4).toString(), "\0asm", `${name} must be WebAssembly`);
  }
});

test("the bundled SCUMM engine can open FLAC speech archives", () => {
  const path = new URL("../scummvm-shell/data/plugins/libscumm.so", import.meta.url);
  const plugin = new WebAssembly.Module(fs.readFileSync(path));
  assert.ok(WebAssembly.Module.imports(plugin).some(({ name }) => name.includes("makeFLACStream")));
});
