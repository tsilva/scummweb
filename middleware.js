import { NextResponse } from "next/server";

const versionedBundlePaths = new Set([
  "/favicon.ico",
  "/focus-overlay.js",
  "/game.json",
  "/games.json",
  "/index.html",
  "/logo.svg",
  "/manifest.json",
  "/scummvm-192.png",
  "/scummvm-512.png",
  "/scummvm.html",
  "/scummvm.ini",
  "/scummvm.js",
  "/scummvm.wasm",
  "/scummvm_fs.js",
  "/source-info.json",
  "/source.html",
]);

const versionedBundlePrefixes = ["/data/", "/doc/", "/launcher/"];
const immutableCacheControl = "public, max-age=31536000, immutable";
const revalidateCacheControl = "public, max-age=0, must-revalidate";

export function middleware(request) {
  const { pathname, searchParams } = request.nextUrl;
  const response = NextResponse.next();
  const isVersionedBundleAsset =
    versionedBundlePaths.has(pathname) ||
    versionedBundlePrefixes.some((prefix) => pathname.startsWith(prefix));

  if (isVersionedBundleAsset) {
    response.headers.set(
      "Cache-Control",
      searchParams.has("v") ? immutableCacheControl : revalidateCacheControl
    );
  }

  return response;
}

export const config = {
  matcher: [
    "/favicon.ico",
    "/focus-overlay.js",
    "/game.json",
    "/games.json",
    "/index.html",
    "/logo.svg",
    "/manifest.json",
    "/scummvm-192.png",
    "/scummvm-512.png",
    "/scummvm.html",
    "/scummvm.ini",
    "/scummvm.js",
    "/scummvm.wasm",
    "/scummvm_fs.js",
    "/source-info.json",
    "/source.html",
    "/data/:path*",
    "/doc/:path*",
    "/launcher/:path*",
  ],
};
