import { NextResponse } from "next/server";

const blockedLegacyScummvmPaths = new Set([
  "/scummvm.html",
  "/scummvm.js",
  "/scummvm.wasm",
  "/scummvm.ini",
  "/scummvm_fs.js",
  "/games.json",
  "/game.json",
  "/source-info.json",
  "/source.html",
  "/index.html",
  "/manifest.json",
]);

const blockedLegacyScummvmPrefixes = ["/data/", "/doc/"];

export function middleware(request) {
  const { pathname } = request.nextUrl;

  if (
    blockedLegacyScummvmPaths.has(pathname) ||
    blockedLegacyScummvmPrefixes.some((prefix) => pathname.startsWith(prefix))
  ) {
    return new NextResponse("Not Found", { status: 404 });
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/scummvm.html",
    "/scummvm.js",
    "/scummvm.wasm",
    "/scummvm.ini",
    "/scummvm_fs.js",
    "/games.json",
    "/game.json",
    "/source-info.json",
    "/source.html",
    "/index.html",
    "/manifest.json",
    "/data/:path*",
    "/doc/:path*",
  ],
};
