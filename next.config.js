const { withSentryConfig } = require("@sentry/nextjs");
const socialCards = require("./data/social-cards.json");
const runtimeAssets = require("./scummvm-shell/runtime-assets.json");
const assetConfig = require("./lib/scummvm-shell-assets.js");

function getScummvmAssetVersion() {
  const rawVersion =
    process.env.SCUMMVM_ASSET_VERSION ||
    process.env.VERCEL_DEPLOYMENT_ID ||
    process.env.VERCEL_URL ||
    process.env.VERCEL_GIT_COMMIT_SHA ||
    runtimeAssets.version;

  return rawVersion.replace(/[^a-zA-Z0-9._-]+/g, "-");
}

function getDistDir() {
  if (process.env.SCUMMWEB_DIST_DIR) {
    return process.env.SCUMMWEB_DIST_DIR;
  }

  if (process.env.NODE_ENV !== "development") {
    return ".next";
  }

  // Keep dev servers isolated so another local build or dev session cannot delete
  // the active server's runtime chunks.
  return `.next-dev-${process.pid}`;
}

function getSentryEnabledDefault() {
  return process.env.VERCEL_ENV === "production" ? "true" : "false";
}

function getSentryEnvironment() {
  return (
    process.env.SENTRY_ENVIRONMENT ||
    process.env.VERCEL_ENV ||
    process.env.NODE_ENV ||
    "development"
  );
}

/** @type {import('next').NextConfig} */
const nextConfig = {
  distDir: getDistDir(),
  rewrites() {
    return [
      {
        source: "/opengraph-image",
        destination: "/brand/web-seo/og-image-1200x630.png",
      },
      ...Object.entries(socialCards.cards).flatMap(([slug, card]) => [
        { source: `/${slug}/social-card.png`, destination: `/social-cards/${card.file}` },
        { source: `/${slug}/opengraph-image`, destination: `/social-cards/${card.file}` },
      ]),
    ];
  },
  headers() {
    const appVersion = getScummvmAssetVersion().replaceAll(".", "\\.");
    return [
      ...assetConfig.versionedAssetMatchers.filter((source) =>
        !runtimeAssets.files[source] && source !== "/data/:path*" && source !== "/scummvm.html"
      ).map((source) => ({
        source,
        has: [{ type: "query", key: "v", value: appVersion }],
        headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }],
      })),
      ...Object.entries(runtimeAssets.files).filter(([source]) => source !== "/scummvm.html").map(([source, version]) => ({
        source,
        has: [{ type: "query", key: "v", value: version }],
        headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }],
      })),
      {
        source: "/social-cards/:file",
        headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }],
      },
      {
        source: "/scummvm.html",
        headers: [{ key: "X-Robots-Tag", value: "noindex" }],
      },
      {
        source: "/data/plugins/:engine.so",
        headers: [{ key: "Content-Type", value: "application/wasm" }],
      },
    ];
  },
  env: {
    NEXT_PUBLIC_VERCEL_ANALYTICS_ENABLED: process.env.VERCEL === "1" ? "true" : "false",
    NEXT_PUBLIC_SENTRY_ENABLED_DEFAULT: getSentryEnabledDefault(),
    NEXT_PUBLIC_SENTRY_ENVIRONMENT: getSentryEnvironment(),
    NEXT_PUBLIC_SCUMMVM_ASSET_VERSION: getScummvmAssetVersion(),
  },
};

const isHostedBuild = process.env.VERCEL === "1" && Boolean(process.env.VERCEL_DEPLOYMENT_ID);

module.exports = withSentryConfig(nextConfig, {
  sourcemaps: { disable: !isHostedBuild },
  useRunAfterProductionCompileHook: isHostedBuild ? undefined : false,
  // For all available options, see:
  // https://www.npmjs.com/package/@sentry/webpack-plugin#options

  authToken: isHostedBuild ? process.env.SENTRY_AUTH_TOKEN : undefined,
  org: process.env.SENTRY_ORG || "tsilva",
  project: process.env.SENTRY_PROJECT || "scummweb",

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
    disableSentryConfig: !isHostedBuild,
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
