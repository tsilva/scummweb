export const gamesOrigin = (process.env.SCUMMVM_GAMES_ORIGIN || "https://scummvm-games.tsilva.eu").replace(
  /\/$/,
  ""
);

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

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const upstreamBaseHeaders = {
  Accept: "*/*",
  "Accept-Language": "en-US,en;q=0.9",
  "Cache-Control": "no-cache",
  Pragma: "no-cache",
  Referer: "https://scummweb.tsilva.eu/",
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
};

export function getGamesOriginUrl(params) {
  const segments = Array.isArray(params?.path) ? params.path : [];

  if (segments.length === 0) {
    return null;
  }

  const upstreamPath = segments.map((segment) => encodeURIComponent(segment)).join("/");
  return new URL(upstreamPath, `${gamesOrigin}/`);
}

export async function proxyToGamesOrigin(request, params) {
  const upstreamUrl = getGamesOriginUrl(params);

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

export async function GET(request, context) {
  return proxyToGamesOrigin(request, context.params);
}

export async function HEAD(request, context) {
  return proxyToGamesOrigin(request, context.params);
}
