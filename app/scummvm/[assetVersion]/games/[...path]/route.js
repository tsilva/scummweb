import { getGamesOriginUrl, proxyToGamesOrigin } from "../../../../games-proxy/[...path]/route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function shouldProxyLocally(request) {
  const hostname = request.nextUrl.hostname;
  return hostname === "127.0.0.1" || hostname === "localhost";
}

function redirectToGamesOrigin(params) {
  const upstreamUrl = getGamesOriginUrl(params);

  if (!upstreamUrl) {
    return new Response("Missing games path", { status: 400 });
  }

  return Response.redirect(upstreamUrl, 307);
}

export async function GET(request, context) {
  if (shouldProxyLocally(request)) {
    return proxyToGamesOrigin(request, context.params);
  }

  return redirectToGamesOrigin(context.params);
}

export async function HEAD(request, context) {
  if (shouldProxyLocally(request)) {
    return proxyToGamesOrigin(request, context.params);
  }

  return redirectToGamesOrigin(context.params);
}
