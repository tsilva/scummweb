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
    return {
      afterFiles: scummvmVersionedAssetRoutes.map(([source, destination]) => ({
        source: `/scummvm/:assetVersion/${source}`,
        destination,
      })),
    };
  },
  async headers() {
    return [
      ...scummvmVersionedAssetRoutes.map(([source]) => ({
        source: `/scummvm/:assetVersion/${source}`,
        headers: immutableScummvmShellCacheHeaders,
      })),
    ];
  },
};
module.exports = nextConfig;


// Injected content via Sentry wizard below

const { withSentryConfig } = require("@sentry/nextjs");

module.exports = withSentryConfig(module.exports, {
  // For all available options, see:
  // https://www.npmjs.com/package/@sentry/webpack-plugin#options

  org: "tsilva",
  project: "scummweb",

  // Only print logs for uploading source maps in CI
  silent: !process.env.CI,

  // For all available options, see:
  // https://docs.sentry.io/platforms/javascript/guides/nextjs/manual-setup/

  // Upload a larger set of source maps for prettier stack traces (increases build time)
  widenClientFileUpload: true,

  // Route browser requests to Sentry through a Next.js rewrite to circumvent ad-blockers.
  // This can increase your server load as well as your hosting bill.
  // Note: Check that the configured route will not match with your Next.js middleware, otherwise reporting of client-
  // side errors will fail.
  tunnelRoute: "/monitoring",

  webpack: {
    // Enables automatic instrumentation of Vercel Cron Monitors. (Does not yet work with App Router route handlers.)
    // See the following for more information:
    // https://docs.sentry.io/product/crons/
    // https://vercel.com/docs/cron-jobs
    automaticVercelMonitors: true,

    // Tree-shaking options for reducing bundle size
    treeshake: {
      // Automatically tree-shake Sentry logger statements to reduce bundle size
      removeDebugLogging: true,
    },
  },
});
