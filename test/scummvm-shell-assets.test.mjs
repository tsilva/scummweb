import assert from "node:assert/strict";
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
  assert.ok(versionedAssetMatchers.includes("/source.html"));
  assert.equal(isVersionedAsset("/launcher/poster.png"), true);
  assert.equal(isVersionedAsset("/scummvm.js"), true);
  assert.equal(isVersionedAsset("/unmanaged.txt"), false);
});
