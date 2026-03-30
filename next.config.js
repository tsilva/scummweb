const { withSentryConfig } = require("@sentry/nextjs");

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

/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    instrumentationHook: true,
  },
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
    return scummvmVersionedAssetRoutes.map(([source]) => ({
      source: `/scummvm/:assetVersion/${source}`,
      headers: immutableScummvmShellCacheHeaders,
    }));
  },
};

const sentryWebpackPluginOptions = {
  silent: !process.env.CI,
};

if (process.env.SENTRY_AUTH_TOKEN) {
  sentryWebpackPluginOptions.authToken = process.env.SENTRY_AUTH_TOKEN;
  sentryWebpackPluginOptions.org = process.env.SENTRY_ORG;
  sentryWebpackPluginOptions.project = process.env.SENTRY_PROJECT;
  sentryWebpackPluginOptions.widenClientFileUpload = true;
}

module.exports = withSentryConfig(nextConfig, sentryWebpackPluginOptions);
