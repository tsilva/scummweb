import { NextResponse } from "next/server";
import assetConfig from "./lib/scummvm-shell-assets.js";

const { isVersionedAsset } = assetConfig;
const immutableCacheControl = "public, max-age=31536000, immutable";
const revalidateCacheControl = "public, max-age=0, must-revalidate";

export function middleware(request) {
  const { pathname, searchParams } = request.nextUrl;
  const response = NextResponse.next();

  if (isVersionedAsset(pathname)) {
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
