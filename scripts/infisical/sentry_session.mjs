import fs from "node:fs";
import { syncBuiltinESMExports } from "node:module";

export const MARKER = "sentry_read_public_placeholder";
const PROJECT = "scummweb";
const PROJECT_PATH = `/api/0/projects/tsilva/${PROJECT}/`;
const QUERY_KEYS = new Set(["limit", "query", "statsPeriod", "cursor", "sort"]);

export function installSession(base, env = process.env) {
  const proxy = new URL(env.HTTP_PROXY);
  const secureProxy = new URL(env.HTTPS_PROXY);
  if (
    env.SENTRY_VAULT_TRANSPORT !== "agent-vault" ||
    env.SENTRY_AUTH_TOKEN !== MARKER ||
    env.SENTRY_ORG !== "tsilva" ||
    env.SENTRY_PROJECT !== PROJECT ||
    env.SENTRY_BASE_URL !== base ||
    env.NO_PROXY || env.no_proxy ||
    env.NODE_TLS_REJECT_UNAUTHORIZED === "0" ||
    env.NODE_USE_ENV_PROXY !== "1" ||
    proxy.href !== secureProxy.href ||
    proxy.protocol !== "http:" ||
    proxy.host !== "127.0.0.1:8283" ||
    !proxy.password ||
    ["http_proxy", "https_proxy"].some(key => env[key] && new URL(env[key]).href !== proxy.href)
  ) {
    throw new Error("Expected the reviewed ScummWEB Sentry Vault session");
  }

  // Skip the original reader's optional dotenv discovery, including named overrides.
  // The native sandbox independently denies credential-file reads.
  const exists = fs.existsSync.bind(fs);
  fs.existsSync = file => /(^|\/)\.env($|[./])/.test(String(file)) ? false : exists(file);
  syncBuiltinESMExports();

  const origin = new URL(base).origin;
  const originalFetch = globalThis.fetch;
  let projectId;
  globalThis.fetch = async (input, init) => {
    const url = new URL(typeof input === "string" || input instanceof URL ? input : input.url);
    const headers = new Headers(init?.headers ?? input.headers);
    const method = init?.method ?? input.method ?? "GET";
    if (
      url.origin !== origin || url.username || url.password || url.hash ||
      method !== "GET" || headers.has("cookie") ||
      headers.get("Authorization") !== `Bearer ${MARKER}`
    ) {
      throw new Error("Request outside the reviewed ScummWEB Sentry route");
    }

    // Preserve the original reader's project-filtered organization query while
    // granting only the corresponding single-project endpoint in Agent Vault.
    if (url.pathname === "/api/0/organizations/tsilva/issues/") {
      if (!projectId || url.searchParams.getAll("project").length !== 1 ||
          url.searchParams.get("project") !== projectId) {
        throw new Error("Sentry project filter mismatch");
      }
      url.pathname = `${PROJECT_PATH}issues/`;
      url.searchParams.delete("project");
    }

    const parameters = [...url.searchParams.keys()];
    const limit = url.searchParams.get("limit");
    if (
      ![PROJECT_PATH, `${PROJECT_PATH}issues/`].includes(url.pathname) ||
      (url.pathname === PROJECT_PATH && url.search) ||
      parameters.some(key => !QUERY_KEYS.has(key) || url.searchParams.getAll(key).length !== 1) ||
      (limit !== null && (!/^\d{1,3}$/.test(limit) || Number(limit) < 1 || Number(limit) > 100))
    ) {
      throw new Error("Request outside reviewed Sentry endpoints");
    }

    let response;
    try {
      response = await originalFetch(url, {
        ...init, method, headers, redirect: "error", signal: AbortSignal.timeout(20000),
      });
    } catch {
      throw new Error("Sentry transport failed; provider details withheld");
    }
    if (!response.ok) {
      await response.body?.cancel();
      return Response.json({ error: "Sentry request rejected; details withheld" }, { status: response.status });
    }
    if (url.pathname === PROJECT_PATH) {
      const data = await response.json();
      if (data.slug !== PROJECT || !/^\d+$/.test(String(data.id))) {
        throw new Error("Unexpected Sentry project binding");
      }
      projectId = String(data.id);
      return Response.json({ id: projectId, slug: PROJECT, name: PROJECT });
    }
    return response;
  };
  return PROJECT_PATH;
}
