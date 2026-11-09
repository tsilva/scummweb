import { maxArchiveSize } from "./local-game-selection.mjs";

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
