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

const versionedAssetPrefixes = ["/data/", "/doc/", "/launcher/"];
const versionedAssetPaths = managedPaths
  .filter((assetPath) => !["data", "doc", "launcher"].includes(assetPath))
  .map((assetPath) => `/${assetPath}`)
  .concat("/source.html");
const versionedAssetMatchers = [
  ...versionedAssetPaths,
  ...versionedAssetPrefixes.map((prefix) => `${prefix}:path*`),
];

function isVersionedAsset(pathname) {
  return (
    versionedAssetPaths.includes(pathname) ||
    versionedAssetPrefixes.some((prefix) => pathname.startsWith(prefix))
  );
}

module.exports = {
  managedPaths,
  requiredPaths,
  stalePaths,
  versionedAssetPaths,
  versionedAssetPrefixes,
  versionedAssetMatchers,
  isVersionedAsset,
};
