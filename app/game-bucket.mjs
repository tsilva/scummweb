import { maxArchiveSize, readLocalGameArchive } from "./local-game-archive.mjs";

export const bucketStorageKey = "scummweb.game-bucket.v1";

export function getBucketPlayHref(target) {
  return `/bucket/${encodeURIComponent(target)}/play`;
}

export function normalizeBucketUrl(value) {
  let url;
  try {
    url = new URL(value.trim());
  } catch {
    // Invalid input gets the same message as an unsupported URL.
  }
  if (url?.protocol === "https:" && !url.username && !url.password && !url.search && !url.hash) {
    return `${url.origin}${url.pathname.replace(/\/+$/, "")}`;
  }
  throw new Error("Enter a public HTTPS bucket URL without credentials, a query, or a fragment.");
}

export function normalizeGameZipUrl(value) {
  try {
    const url = new URL(value.trim());
    if (url.protocol === "https:" && !url.username && !url.password
        && decodeURIComponent(url.pathname).toLowerCase().endsWith(".zip")) {
      url.hash = "";
      return url.href;
    }
  } catch {
    // Invalid URL syntax and malformed path encoding get the same message.
  }
  throw new Error("Enter a direct HTTPS link to a game ZIP.");
}

export function bucketZipName(target) {
  return `${target}.zip`;
}

export function bucketZipUrl(baseUrl, target) {
  return `${baseUrl}/${encodeURIComponent(bucketZipName(target))}`;
}

export function readSavedBucket(value, games) {
  const { url, targets } = JSON.parse(value) ?? {};
  if (typeof url !== "string" || !Array.isArray(targets)) return null;
  const matched = games.filter(({ target }) => targets.includes(target)).map(({ target }) => target);
  return matched.length ? { url: normalizeBucketUrl(url), targets: matched } : null;
}

export async function checkGameZip(url, signal) {
  const response = await fetch(url, {
    method: "HEAD",
    credentials: "omit",
    redirect: "error",
    cache: "no-store",
    signal,
  });
  const contentType = response.headers.get("content-type") ?? "";
  return response.ok && !contentType.toLowerCase().startsWith("text/html")
    && Number(response.headers.get("content-length")) <= maxArchiveSize;
}

export async function readRemoteGameArchive(url, options) {
  return downloadGameArchive(normalizeGameZipUrl(url), options);
}

export function readCatalogGameArchive(url, options) {
  const { hostname } = window.location;
  const fetchUrl = hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]"
    ? `/games-proxy/${new URL(url).pathname.split("/").at(-1)}`
    : normalizeGameZipUrl(url);
  return downloadGameArchive(fetchUrl, options);
}

async function downloadGameArchive(zipUrl, { signal, onEntries, archiveLimit = maxArchiveSize, expandedLimit, timeoutMs = 120_000 } = {}) {
  const timeout = AbortSignal.timeout(timeoutMs);
  const response = await fetch(zipUrl, {
    mode: "cors",
    credentials: "omit",
    referrerPolicy: "no-referrer",
    redirect: "error",
    signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
  }).catch(() => null);
  if (!response?.ok || !response.body) {
    throw new Error("Could not download the ZIP. Check that the direct link works and the host allows cross-origin downloads. You can also download the ZIP yourself and drop it on ScummWEB.");
  }

  const tooLarge = `This ZIP exceeds the ${archiveLimit / (1024 * 1024)} MiB download limit.`;
  if (Number(response.headers.get("content-length")) > archiveLimit) {
    await response.body.cancel();
    throw new Error(tooLarge);
  }

  let size = 0;
  const limitedBody = response.body.pipeThrough(new TransformStream({
    transform(chunk, controller) {
      size += chunk.byteLength;
      if (size > archiveLimit) {
        controller.error(new Error(tooLarge));
        return;
      }
      controller.enqueue(chunk);
    },
  }));
  const archive = await new Response(limitedBody).blob();
  return readLocalGameArchive(new File([archive], "game.zip"), { archiveLimit, expandedLimit, signal, onEntries });
}
