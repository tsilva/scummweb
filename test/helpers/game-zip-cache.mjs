// Response bodies are single-use, just as they are in browser CacheStorage.
export function installGameZipCache(t) {
  const entries = new Map();
  const key = (request) => typeof request === "string" ? request : request.url;
  const cache = {
    async match(request) { return entries.get(key(request))?.clone(); },
    async put(request, response) { entries.set(key(request), response.clone()); },
    async delete(request) { return entries.delete(key(request)); },
    async keys() { return [...entries.keys()].map((url) => ({ url })); },
  };
  const previous = Object.getOwnPropertyDescriptor(globalThis, "caches");
  Object.defineProperty(globalThis, "caches", { configurable: true, value: { open: async () => cache } });
  t.after(() => previous ? Object.defineProperty(globalThis, "caches", previous) : delete globalThis.caches);
  return { entries, cache };
}
