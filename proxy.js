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
  // Gate app handoffs before invoking the function. This intentionally broad,
  // case-insensitive superset must cover isInAppBrowser; that helper decides
  // whether to rewrite. Keep the unconditional legacy player route.
  matcher: [
    {
      source: "/((?!api(?:/|$)|_next(?:/|$)|monitoring(?:/|$)|in-app-browser(?:/|$)|.*opengraph-image(?:/|$)|.*\\.).*)",
      has: [{ type: "header", key: "user-agent", value: ".*(?:[Ff][Bb][Aa][Nn]|[Ff][Bb][Aa][Vv]|[Ff][Bb]_[Ii][Aa][Bb]|[Ii][Nn][Ss][Tt][Aa][Gg][Rr][Aa][Mm]|[Ll][Ii][Nn][Kk][Ee][Dd][Ii][Nn][Aa][Pp][Pp]|[Ss][Nn][Aa][Pp][Cc][Hh][Aa][Tt]|[Pp][Ii][Nn][Tt][Ee][Rr][Ee][Ss][Tt]|[Mm][Ii][Cc][Rr][Oo][Mm][Ee][Ss][Ss][Ee][Nn][Gg][Ee][Rr]|[Tt][Ii][Kk][Tt][Oo][Kk]|[Bb][Yy][Tt][Ee][Dd][Aa][Nn][Cc][Ee][Ww][Ee][Bb][Vv][Ii][Ee][Ww]|[Mm][Uu][Ss][Ii][Cc][Aa][Ll]_[Ll][Yy]|[Ll][Ii][Nn][Ee]/|[Ww][Vv]\\)).*" }],
    },
    "/scummvm.html",
  ],
};
