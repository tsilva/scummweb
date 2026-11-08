// Keep v1 entries as real ZIPs for older open tabs. New installations use a
// single atomic record: a length-prefixed manifest followed by verified bytes.
export const gameZipCacheName = "scummweb.game-zips.v1";
export const preparedGameCacheName = "scummweb.game-files.v2";
export const maxCachedGameZips = 4;
const preparedType = "application/x-scummweb-game-files";
const maxManifestBytes = 32 * 1024 * 1024;
const pendingWrites = new Map();

async function openCache(name) {
  return globalThis.caches?.open(name);
}

async function readCache(name, url, prepared) {
  try {
    const cache = await openCache(name);
    const response = await cache?.match(url);
    if (!response) return null;
    const stored = await response.blob();
    if (!prepared) return { archive: stored };
    if (response.headers.get("content-type") !== preparedType || stored.size < 4) return null;
    const size = new DataView(await stored.slice(0, 4).arrayBuffer()).getUint32(0, true);
    if (size > maxManifestBytes || size + 4 > stored.size) return null;
    const manifest = JSON.parse(await stored.slice(4, 4 + size).text());
    if (manifest?.version !== 1) return null;
    return { archive: stored.slice(4 + size), manifest };
  } catch {
    return null; // Storage may be blocked, unavailable, incomplete, or evicted.
  }
}

export async function readCachedGameData(url, { waitForWrite = true } = {}) {
  const pending = pendingWrites.get(url);
  if (pending && !waitForWrite) return pending.ready;
  await pending?.done;
  return await readCache(preparedGameCacheName, url, true) || readCache(gameZipCacheName, url, false);
}

export async function deleteCachedGameZip(url) {
  for (const name of [preparedGameCacheName, gameZipCacheName]) {
    try { await (await openCache(name))?.delete(url); } catch { /* Best effort. */ }
  }
}

async function prune() {
  const prepared = await openCache(preparedGameCacheName);
  const legacy = await openCache(gameZipCacheName);
  const keys = new Map();
  // Migrations count as new installations. Keep not-yet-migrated ZIPs within
  // the same four-game bound, without touching saves or other caches.
  for (const key of [...await legacy.keys(), ...await prepared.keys()]) keys.set(key.url, key);
  for (const key of [...keys.values()].slice(0, Math.max(0, keys.size - maxCachedGameZips))) {
    await Promise.all([prepared.delete(key), legacy.delete(key)]);
  }
}

export async function cacheGameZip(url, archive) {
  try {
    const cache = await openCache(gameZipCacheName);
    if (!cache) return false;
    await cache.put(url, new Response(archive, {
      headers: { "content-type": "application/zip", "content-length": String(archive.size ?? archive.byteLength) },
    }));
    await (await openCache(preparedGameCacheName))?.delete(url);
    await prune();
    return true;
  } catch {
    return false;
  }
}

export function cachePreparedGame(url, archive, files, entries) {
  if (!globalThis.caches) return;
  let bundle;
  let ready;
  try {
    const manifest = { version: 1, archiveSize: archive.size ?? archive.byteLength, entries: entries.map((entry) => [...entry]) };
    const metadata = new TextEncoder().encode(JSON.stringify(manifest));
    if (metadata.length > maxManifestBytes) return;
    const header = new Uint8Array(4);
    new DataView(header.buffer).setUint32(0, metadata.length, true);
    // Snapshot before the player transfers/detaches ArrayBuffers. Native Blob
    // storage avoids concatenating into another huge Uint8Array.
    bundle = new Blob([header, metadata, ...files.map(({ blob, data }) => blob ?? data)]);
    ready = { archive: bundle.slice(4 + metadata.length), manifest };
  } catch {
    return; // Optional persistence must never stop an otherwise valid launch.
  }
  const pending = { ready, done: null };
  pending.done = writePreparedGame(url, bundle)
    .then((stored) => stored || cacheGameZip(url, archive))
    .catch(() => false)
    .finally(() => { if (pendingWrites.get(url) === pending) pendingWrites.delete(url); });
  pendingWrites.set(url, pending);
  return pending.done;
}

async function writePreparedGame(url, bundle) {
  try {
    const cache = await openCache(preparedGameCacheName);
    if (!cache) return false;
    await cache.put(url, new Response(bundle, { headers: { "content-type": preparedType } }));
    await (await openCache(gameZipCacheName))?.delete(url);
    await prune();
    return true;
  } catch {
    return false;
  }
}
