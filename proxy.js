import { NextResponse } from "next/server";
import { isInAppBrowser } from "./app/in-app-browser.mjs";

export function proxy(request) {
  if (["GET", "HEAD"].includes(request.method)
    && isInAppBrowser(request.headers.get("user-agent") || "")) {
    // A rewrite leaves the original game path, query and browser-side fragment intact.
    // Rendering only the handoff also prevents game downloads and player startup.
    const destination = request.nextUrl.clone();
    destination.pathname = "/in-app-browser";
    destination.search = "";
    return NextResponse.rewrite(destination, {
      headers: { "Cache-Control": "private, no-store", "X-Robots-Tag": "noindex" },
    });
  }

  const { pathname, searchParams } = request.nextUrl;
  const isPlayerFrame = searchParams.get("localGame") === "1" || searchParams.has("saveQuery");
  if (pathname === "/scummvm.html" && (!isPlayerFrame ||
      request.headers.get("sec-fetch-dest") === "document")) {
    return NextResponse.rewrite(new URL(`/legacy-play${request.nextUrl.search}`, request.url));
  }
  return NextResponse.next();
}

export const config = {
  // Assets and social previews need no proxy hop; preserve the legacy runtime route.
  matcher: ["/((?!api(?:/|$)|_next(?:/|$)|monitoring(?:/|$)|in-app-browser(?:/|$)|.*opengraph-image(?:/|$)|.*\\.).*)", "/scummvm.html"],
};
