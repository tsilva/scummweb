import { NextResponse } from "next/server";
import bundleAssets from "./lib/bundle-assets.js";

const { isVersionedBundleAsset } = bundleAssets;
const immutableCacheControl = "public, max-age=31536000, immutable";
const revalidateCacheControl = "public, max-age=0, must-revalidate";

export function middleware(request) {
  const { pathname, searchParams } = request.nextUrl;
  const response = NextResponse.next();

  if (isVersionedBundleAsset(pathname)) {
    response.headers.set(
      "Cache-Control",
      searchParams.has("v") ? immutableCacheControl : revalidateCacheControl
    );
  }

  return response;
}

export const config = {
  matcher: ["/:path*"],
};
