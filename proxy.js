import { NextResponse } from "next/server";

export function proxy(request) {
  const { pathname, searchParams } = request.nextUrl;
  const isPlayerFrame = searchParams.get("localGame") === "1" || searchParams.has("saveQuery");
  if (pathname === "/scummvm.html" && (!isPlayerFrame ||
      request.headers.get("sec-fetch-dest") === "document")) {
    return NextResponse.rewrite(new URL(`/legacy-play${request.nextUrl.search}`, request.url));
  }
  return NextResponse.next();
}

export const config = {
  // Static cache headers live in next.config.js; assets need no proxy hop.
  matcher: ["/scummvm.html"],
};
