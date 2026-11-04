import sourceInfo from "../scummvm-shell/source-info.json" with { type: "json" };
import runtimeAssets from "../scummvm-shell/runtime-version.json" with { type: "json" };

function sanitizeAssetVersion(rawVersion) {
  return rawVersion.replace(/[^a-zA-Z0-9._-]+/g, "-");
}

function getRawAssetVersion() {
  return (
    process.env.NEXT_PUBLIC_SCUMMVM_ASSET_VERSION ||
    process.env.SCUMMVM_ASSET_VERSION ||
    process.env.VERCEL_DEPLOYMENT_ID ||
    process.env.VERCEL_URL ||
    process.env.VERCEL_GIT_COMMIT_SHA ||
    runtimeAssets.version
  );
}

const rawAssetVersion = getRawAssetVersion();
export const scummvmAssetVersion = sanitizeAssetVersion(
  rawAssetVersion === "dev" ? `dev-${sourceInfo.generated_at_utc}` : rawAssetVersion
);

export function getAssetVersion(assetPath) {
  return runtimeAssets.files[assetPath] || scummvmAssetVersion;
}

function appendAssetVersion(url) {
  url.searchParams.delete("v");
  url.searchParams.append("v", getAssetVersion(url.pathname));
  return url;
}

export function buildVersionedAssetPath(assetPath, options = {}) {
  if (!assetPath || !assetPath.startsWith("/")) {
    return assetPath;
  }

  const resolved = new URL(assetPath, "https://scummweb.local");
  const searchParams = options.searchParams || {};

  for (const [key, value] of Object.entries(searchParams)) {
    if (value == null) {
      continue;
    }

    resolved.searchParams.delete(key);
    resolved.searchParams.append(key, String(value));
  }

  if (options.hash) {
    resolved.hash = options.hash;
  }

  appendAssetVersion(resolved);
  return `${resolved.pathname}${resolved.search}${resolved.hash}`;
}

export function getVersionedSiteAssetPath(assetPath) {
  return buildVersionedAssetPath(assetPath);
}
