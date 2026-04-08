import { getGamesOrigin, getSiteUrl } from "../../lib/site-config.mjs";

export const gamesOrigin = getGamesOrigin();

const passthroughHeaderNames = [
  "accept-ranges",
  "cache-control",
  "content-length",
  "content-range",
  "content-type",
  "etag",
  "last-modified",
  "vary",
];

const upstreamBaseHeaders = {
  Accept: "*/*",
  "Accept-Language": "en-US,en;q=0.9",
  "Cache-Control": "no-cache",
  Pragma: "no-cache",
  Referer: `${getSiteUrl()}/`,
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
};

export async function getGamesOriginUrl(params) {
  const resolvedParams = await params;
  const segments = Array.isArray(resolvedParams?.path) ? resolvedParams.path : [];

  if (segments.length === 0) {
    return null;
  }

  const upstreamPath = segments.map((segment) => encodeURIComponent(segment)).join("/");
  return new URL(upstreamPath, `${gamesOrigin}/`);
}

export async function proxyToGamesOrigin(request, params) {
  const upstreamUrl = await getGamesOriginUrl(params);

  if (!upstreamUrl) {
    return new Response("Missing games path", { status: 400 });
  }

  const requestHeaders = new Headers(upstreamBaseHeaders);

  for (const headerName of ["range", "if-none-match", "if-modified-since"]) {
    const value = request.headers.get(headerName);
    if (value) {
      requestHeaders.set(headerName, value);
    }
  }

  const upstreamResponse = await fetch(upstreamUrl, {
    headers: requestHeaders,
    redirect: "follow",
    cache: "no-store",
  });

  const responseHeaders = new Headers();

  for (const headerName of passthroughHeaderNames) {
    const value = upstreamResponse.headers.get(headerName);
    if (value) {
      responseHeaders.set(headerName, value);
    }
  }

  return new Response(upstreamResponse.body, {
    status: upstreamResponse.status,
    headers: responseHeaders,
  });
}
