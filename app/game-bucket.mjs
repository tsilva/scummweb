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

export async function checkGameBucket(url, games, officialUrl, { signal, localIndex } = {}) {
  const options = { credentials: "omit", redirect: "error", cache: "no-store", signal };
  if (url === officialUrl) {
    // The official bucket serves unpacked games and has a shared filesystem index.
    const response = await fetch(localIndex || `${url}/index.json`, options);
    if (!response.ok) throw new Error("Could not read the ScummWeb bucket index.");
    const index = await response.json();
    return games
      .filter(({ path }) => path?.startsWith("/games/") && Object.hasOwn(index, path.slice("/games/".length)))
      .map(({ target }) => target);
  }

  const results = await Promise.allSettled(games.map(async ({ target }) => {
    const response = await fetch(bucketZipUrl(url, target), { ...options, method: "HEAD" });
    const contentType = response.headers.get("content-type") ?? "";
    return response.ok && !contentType.toLowerCase().startsWith("text/html") ? target : null;
  }));
  const matches = results.flatMap((result) => result.status === "fulfilled" && result.value ? [result.value] : []);
  if (!matches.length && results.some((result) => result.status === "rejected")) {
    throw new Error("Could not check the ZIPs. Make sure the bucket allows browser access from ScummWeb.");
  }
  return matches;
}

export async function readBucketGameArchive(url, target, { signal } = {}) {
  const timeout = AbortSignal.timeout(120_000);
  const response = await fetch(bucketZipUrl(url, target), {
    credentials: "omit",
    redirect: "error",
    signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
  }).catch(() => null);
  if (!response?.ok || !response.body) {
    throw new Error("Could not download the ZIP. Check that it is public and allows browser access.");
  }

  const tooLarge = "This ZIP exceeds the 128 MiB download limit.";
  if (Number(response.headers.get("content-length")) > maxArchiveSize) {
    await response.body.cancel();
    throw new Error(tooLarge);
  }

  let size = 0;
  const limitedBody = response.body.pipeThrough(new TransformStream({
    transform(chunk, controller) {
      size += chunk.byteLength;
      if (size > maxArchiveSize) {
        controller.error(new Error(tooLarge));
        return;
      }
      controller.enqueue(chunk);
    },
  }));
  const archive = await new Response(limitedBody).blob();
  return readLocalGameArchive(new File([archive], bucketZipName(target)));
}
