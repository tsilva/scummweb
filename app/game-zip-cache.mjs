// Cache only complete, validated archives. This cache is separate from saves.
export const gameZipCacheName = "scummweb.game-zips.v1";
export const maxCachedGameZips = 4;

export async function readCachedGameZip(url) {
  try {
    const cache = await globalThis.caches?.open(gameZipCacheName);
    const response = await cache?.match(url);
    return response ? await response.blob() : null;
  } catch {
    // Storage may be blocked, unavailable in private mode, or evicted.
    return null;
  }
}

export async function deleteCachedGameZip(url) {
  try {
    const cache = await globalThis.caches?.open(gameZipCacheName);
    await cache?.delete(url);
  } catch {
    // Cache maintenance must never prevent a game from launching.
  }
}

export async function cacheGameZip(url, archive) {
  try {
    const cache = await globalThis.caches?.open(gameZipCacheName);
    if (!cache) return;
    await cache.put(url, new Response(archive, {
      headers: { "content-type": "application/zip", "content-length": String(archive.size) },
    }));
    // Cache keys preserve insertion order. Bound storage without touching saves
    // or other caches, and keep query parameters as part of the archive identity.
    const keys = await cache.keys();
    for (const key of keys.slice(0, Math.max(0, keys.length - maxCachedGameZips))) {
      await cache.delete(key);
    }
  } catch {
    // Quota failures and disabled storage leave ordinary downloads working.
  }
}
