// Response bodies are single-use, just as they are in browser CacheStorage.
export function installGameZipCache(t) {
  const stores = new Map();
  const key = (request) => typeof request === "string" ? request : request.url;
  function open(name) {
    if (stores.has(name)) return stores.get(name);
    const entries = new Map();
    const cache = {
      async match(request) { return entries.get(key(request))?.clone(); },
      async put(request, response) { entries.set(key(request), response.clone()); },
      async delete(request) { return entries.delete(key(request)); },
      async keys() { return [...entries.keys()].map((url) => ({ url })); },
    };
    const store = { entries, cache };
    stores.set(name, store);
    return store;
  }
  const { entries, cache } = open("scummweb.game-files.v2");
  const { entries: legacyEntries, cache: legacyCache } = open("scummweb.game-zips.v1");
  const previous = Object.getOwnPropertyDescriptor(globalThis, "caches");
  Object.defineProperty(globalThis, "caches", { configurable: true, value: { open: async (name) => open(name).cache } });
  t.after(() => previous ? Object.defineProperty(globalThis, "caches", previous) : delete globalThis.caches);
  return { entries, cache, stores, legacyEntries, legacyCache };
}
