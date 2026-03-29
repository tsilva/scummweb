const revalidatedScummvmShellCacheHeaders = [
  {
    key: "Cache-Control",
    value: "public, max-age=0, must-revalidate",
  },
];

const immutableScummvmShellCacheHeaders = [
  {
    key: "Cache-Control",
    value: "public, max-age=31536000, immutable",
  },
];

function getScummvmAssetVersion() {
  const rawVersion =
    process.env.SCUMMVM_ASSET_VERSION ||
    process.env.VERCEL_DEPLOYMENT_ID ||
    process.env.VERCEL_URL ||
    process.env.VERCEL_GIT_COMMIT_SHA ||
    "dev";

  return rawVersion.replace(/[^a-zA-Z0-9._-]+/g, "-");
}

const scummvmAssetVersion = getScummvmAssetVersion();

const scummvmVersionedAssetRoutes = [
  ["scummvm.html", "/scummvm.html"],
  ["scummvm.js", "/scummvm.js"],
  ["scummvm.wasm", "/scummvm.wasm"],
  ["scummvm.ini", "/scummvm.ini"],
  ["scummvm_fs.js", "/scummvm_fs.js"],
  ["games.json", "/games.json"],
  ["game.json", "/game.json"],
  ["source-info.json", "/source-info.json"],
  ["source.html", "/source.html"],
  ["index.html", "/index.html"],
  ["manifest.json", "/manifest.json"],
  ["favicon.ico", "/favicon.ico"],
  ["logo.svg", "/logo.svg"],
  ["scummvm-192.png", "/scummvm-192.png"],
  ["scummvm-512.png", "/scummvm-512.png"],
  ["data/:path*", "/data/:path*"],
  ["doc/:path*", "/doc/:path*"],
];

const scummvmLegacyAssetRoutes = [
  "/scummvm.html",
  "/scummvm.js",
  "/scummvm.wasm",
  "/scummvm.ini",
  "/scummvm_fs.js",
  "/games.json",
  "/game.json",
  "/source-info.json",
  "/source.html",
  "/index.html",
  "/manifest.json",
  "/favicon.ico",
  "/logo.svg",
  "/scummvm-192.png",
  "/scummvm-512.png",
  "/data/:path*",
  "/doc/:path*",
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  env: {
    NEXT_PUBLIC_SCUMMVM_ASSET_VERSION: scummvmAssetVersion,
  },
  async rewrites() {
    return scummvmVersionedAssetRoutes.map(([source, destination]) => ({
      source: `/scummvm/:assetVersion/${source}`,
      destination,
    }));
  },
  async headers() {
    return [
      ...scummvmVersionedAssetRoutes.map(([source]) => ({
        source: `/scummvm/:assetVersion/${source}`,
        headers: immutableScummvmShellCacheHeaders,
      })),
      ...scummvmLegacyAssetRoutes.map((source) => ({
        source,
        headers: revalidatedScummvmShellCacheHeaders,
      })),
    ];
  },
};

module.exports = nextConfig;
