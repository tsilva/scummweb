const managedPaths = [
  "data",
  "doc",
  "favicon.ico",
  "focus-overlay.js",
  "games.json",
  "index.html",
  "launcher",
  "logo.svg",
  "manifest.json",
  "scummvm-192.png",
  "scummvm-512.png",
  "scummvm.html",
  "scummvm.ini",
  "scummvm.js",
  "scummvm.wasm",
  "scummvm_fs.js",
  "source-info.json",
];

const requiredPaths = [
  "scummvm.html",
  "scummvm.js",
  "scummvm.wasm",
  "scummvm_fs.js",
];

const stalePaths = [
  "game.json",
  "home-static.html",
  "source.html",
  "sw.js",
];

const versionedBundlePrefixes = ["/data/", "/doc/", "/launcher/"];
const versionedBundlePaths = managedPaths
  .filter((assetPath) => !["data", "doc", "launcher"].includes(assetPath))
  .map((assetPath) => `/${assetPath}`)
  .concat("/source.html");
const versionedBundleMatchers = [
  ...versionedBundlePaths,
  ...versionedBundlePrefixes.map((prefix) => `${prefix}:path*`),
];

function isVersionedBundleAsset(pathname) {
  return (
    versionedBundlePaths.includes(pathname) ||
    versionedBundlePrefixes.some((prefix) => pathname.startsWith(prefix))
  );
}

module.exports = {
  managedPaths,
  requiredPaths,
  stalePaths,
  versionedBundlePaths,
  versionedBundlePrefixes,
  versionedBundleMatchers,
  isVersionedBundleAsset,
};
