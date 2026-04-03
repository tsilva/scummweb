import { proxyToGamesOrigin } from "../shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request, context) {
  return proxyToGamesOrigin(request, context.params);
}

export async function HEAD(request, context) {
  return proxyToGamesOrigin(request, context.params);
}
