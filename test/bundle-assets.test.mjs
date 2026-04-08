import assert from "node:assert/strict";
import test from "node:test";
import bundleAssets from "../lib/bundle-assets.js";

test("required bundle paths are managed and versioned asset matchers cover expected routes", () => {
  const {
    isVersionedBundleAsset,
    managedPaths,
    requiredPaths,
    versionedBundleMatchers,
  } = bundleAssets;

  for (const requiredPath of requiredPaths) {
    assert.ok(managedPaths.includes(requiredPath), `${requiredPath} should stay in managedPaths`);
  }

  assert.ok(versionedBundleMatchers.includes("/launcher/:path*"));
  assert.ok(versionedBundleMatchers.includes("/source.html"));
  assert.equal(isVersionedBundleAsset("/launcher/poster.png"), true);
  assert.equal(isVersionedBundleAsset("/scummvm.js"), true);
  assert.equal(isVersionedBundleAsset("/unmanaged.txt"), false);
});
