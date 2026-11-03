import { bucketStorageKey, bucketZipUrl, checkGameZip, readSavedBucket } from "./game-bucket.mjs";
import { validateGameZip } from "./local-game-archive.mjs";

export function remoteGame(url, game) {
  const name = decodeURIComponent(new URL(url).pathname.split("/").at(-1));
  if (!name.toLowerCase().endsWith(".zip")) throw new Error("Enter a public HTTPS link to a game ZIP.");
  return { id: url, url, name, ...(game && { target: game.target }) };
}

export function localGame(handle, file, id = crypto.randomUUID()) {
  return { id, name: file.name, ...(handle && { handle }), ...(file.kind === "folder" && { kind: "folder" }) };
}

export function bucketGames(url, targets, catalog) {
  return targets.map((target) => ({
    ...remoteGame(bucketZipUrl(url, target), catalog.find((game) => game.target === target)),
    bucket: url,
  }));
}

export function checkRemoteGame(source) {
  return checkGameZip(source.url, AbortSignal.timeout(12_000));
}

export async function checkGameSource(source) {
  try {
    if (source.url) return await checkRemoteGame(source) ? "available" : "missing";
    if (!source.handle) return "locate";
    if (await source.handle.queryPermission({ mode: "read" }) !== "granted") return "permission";
    if (source.kind === "folder") {
      for await (const entry of source.handle.values()) {
        if (entry.name !== ".DS_Store") return "available";
      }
      return "missing";
    }
    validateGameZip(await source.handle.getFile());
    return "available";
  } catch {
    return source.url ? "unverified" : "missing";
  }
}

async function withGameStore(mode, operation) {
  const db = await new Promise((resolve, reject) => {
    const request = indexedDB.open("scummweb.game-library", 1);
    request.onupgradeneeded = () => request.result.createObjectStore("games", { keyPath: "id" });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  try {
    return await new Promise((resolve, reject) => {
      const transaction = db.transaction("games", mode);
      transaction.onabort = () => reject(transaction.error);
      transaction.oncomplete = () => resolve(request?.result);
      const request = operation(transaction.objectStore("games"));
    });
  } finally {
    db.close();
  }
}

export function saveGameSources(sources) {
  return withGameStore("readwrite", (store) => {
    for (const source of sources) store.put(source);
  });
}

export function removeGameSources(ids) {
  return withGameStore("readwrite", (store) => {
    for (const id of ids) store.delete(id);
  });
}

export async function readGameSources(catalog, officialUrl) {
  let legacy;
  try {
    legacy = readSavedBucket(localStorage.getItem(bucketStorageKey), catalog);
  } catch {
    // Ignore an invalid or inaccessible legacy preference.
  }

  const migrated = legacy && legacy.url !== officialUrl ? bucketGames(legacy.url, legacy.targets, catalog) : [];
  try {
    if (migrated.length) {
      await saveGameSources(migrated);
      try {
        localStorage.removeItem(bucketStorageKey);
      } catch {
        // The converted entries are already saved.
      }
    }
    return await withGameStore("readonly", (store) => store.getAll());
  } catch (error) {
    if (migrated.length) return migrated;
    throw error;
  }
}
