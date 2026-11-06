import { ArchiveError, maxArchiveSize, openPreparedGameArchive, readLocalGameArchive } from "./local-game-archive.mjs";
import { cachePreparedGame, deleteCachedGameZip, readCachedGameData } from "./game-zip-cache.mjs";

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

export async function validateGameArchiveResponse(response, archiveLimit = maxArchiveSize) {
  let message;
  if (!response?.ok) {
    message = response
      ? `This ZIP link returned HTTP ${response.status}. Check the link and try again.`
      : "Could not download the ZIP. Check that the direct link works and the host allows cross-origin downloads. You can also download the ZIP yourself and drop it on ScummWEB.";
  } else if (/^(?:text\/html|application\/(?:xhtml\+xml|json|problem\+json)|text\/json)(?:;|$)/i.test(
    (response.headers.get("content-type") || "").trim()
  )) {
    message = "This link returned a web page or JSON instead of a game ZIP. Use a direct ZIP link.";
  } else if (Number(response.headers.get("content-length")) > archiveLimit) {
    message = `This ZIP exceeds the ${archiveLimit / (1024 * 1024)} MiB download limit.`;
  } else if (!response.body) {
    message = "This ZIP link returned an empty response.";
  }
  if (message) {
    await response?.body?.cancel();
    throw new ArchiveError(message);
  }
}

export async function readCachedGameArchive(zipUrl, { signal, onEntries, onProgress, archiveLimit = maxArchiveSize, expandedLimit } = {}) {
  signal?.throwIfAborted();
  const cached = await readCachedGameData(zipUrl, { waitForWrite: false });
  signal?.throwIfAborted();
  if (!cached) return null;
  const { archive, manifest } = cached;
  // Apply the current caller's limits even when no network request is needed.
  if ((manifest?.archiveSize ?? archive.size) > archiveLimit) {
    throw new ArchiveError(`This ZIP exceeds the ${archiveLimit / (1024 * 1024)} MiB download limit.`);
  }
  onProgress?.(null, { cached: true });
  try {
    let entries;
    const options = { archiveLimit, expandedLimit, signal, onEntries: (value) => { entries = value; onEntries?.(value); } };
    const files = manifest
      ? openPreparedGameArchive(archive, manifest, options)
      : await readLocalGameArchive(new File([archive], "game.zip"), options);
    signal?.throwIfAborted();
    if (!manifest) cachePreparedGame(zipUrl, archive, files, entries);
    onProgress?.(100, { cached: true });
    return files;
  } catch (error) {
    signal?.throwIfAborted();
    if (error?.name === "AbortError") throw error;
    await deleteCachedGameZip(zipUrl);
    throw error;
  }
}

async function downloadGameArchive(zipUrl, { signal, onEntries, onProgress, archiveLimit = maxArchiveSize, expandedLimit, timeoutMs = 120_000 } = {}) {
  const cachedFiles = await readCachedGameArchive(zipUrl, { signal, onEntries, onProgress, archiveLimit, expandedLimit });
  if (cachedFiles) return cachedFiles;
  const timeout = AbortSignal.timeout(timeoutMs);
  const response = await fetch(zipUrl, {
    mode: "cors",
    credentials: "omit",
    referrerPolicy: "no-referrer",
    redirect: "error",
    signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
  }).catch(() => null);
  await validateGameArchiveResponse(response, archiveLimit);

  const tooLarge = `This ZIP exceeds the ${archiveLimit / (1024 * 1024)} MiB download limit.`;
  const total = Number(response.headers.get("content-length"));
  const hasTotal = Number.isFinite(total) && total > 0;
  onProgress?.(hasTotal ? 0 : null, { loaded: 0, total: hasTotal ? total : null });
  let size = 0;
  const limitedBody = response.body.pipeThrough(new TransformStream({
    transform(chunk, controller) {
      size += chunk.byteLength;
      if (size > archiveLimit) {
        controller.error(new Error(tooLarge));
        return;
      }
      onProgress?.(hasTotal ? Math.min(99, Math.floor(size / total * 100)) : null,
        { loaded: size, total: hasTotal ? total : null });
      controller.enqueue(chunk);
    },
  }));
  const archive = await new Response(limitedBody).blob();
  onProgress?.(100, { loaded: archive.size, total: archive.size });
  let entries;
  const files = await readLocalGameArchive(new File([archive], "game.zip"), {
    archiveLimit, expandedLimit, signal, onEntries: (value) => { entries = value; onEntries?.(value); },
  });
  signal?.throwIfAborted();
  cachePreparedGame(zipUrl, archive, files, entries);
  return files;
}
