import { syncStore } from "./store.mjs";

export const recordKey = (account, kind, profile) => `${account}/saves-v1/${kind}/${profile}`;
export const cloudSavePrefix = "scummweb.dropbox-save.v1:";
export const cloudSaveEvent = "scummweb:dropbox-saves-changed";
export const workingSaveBudget = 128 * 1024 * 1024;
const restoreReserve = 32 * 1024 * 1024;
const launchGrace = 60 * 1000;
const historyLimit = 1024;
const historyBytes = 2 * 1024 * 1024;
const recentHistory = new Map();

export function cloudSaveStatus(destination) {
  if (!destination) return null;
  try { return JSON.parse(localStorage.getItem(cloudSavePrefix + destination)); } catch { return null; }
}

export function rememberCloudSave(destination, status) {
  const key = cloudSavePrefix + destination;
  const value = status && JSON.stringify(status);
  if (localStorage.getItem(key) === value) return;
  if (value) localStorage.setItem(key, value);
  else localStorage.removeItem(key);
  window.dispatchEvent(new Event(cloudSaveEvent));
}

export function withSaveAccess(destination, action, options = {}) {
  if (!destination || !navigator.locks) return action();
  return navigator.locks.request(`scummweb-dropbox-access:${destination}`, options, lock => lock && action());
}

export function reserveSaveAccess(destination, signal, action) {
  if (!signal) return withSaveAccess(destination, action, { mode: "shared" });
  const result = Promise.withResolvers();
  void withSaveAccess(destination, async () => {
    result.resolve(await action());
    if (!signal.aborted) await new Promise(resolve => signal.addEventListener("abort", resolve, { once: true }));
  }, { mode: "shared", signal }).catch(result.reject);
  return result.promise;
}

export async function recordSaveAccess(account, destination) {
  if (account && destination) await syncStore.put({ id: recordKey(account, "access", destination), usedAt: Date.now() });
}

export function lastSaveAccess(account, destination) {
  return syncStore.get(recordKey(account, "access", destination));
}

export function recentlyOpened(access) {
  return access && Date.now() - access.usedAt < launchGrace;
}

export async function workingSaveLimit() {
  const estimate = await globalThis.navigator?.storage?.estimate?.().catch(() => null);
  const available = estimate && estimate.quota - estimate.usage;
  return Number.isFinite(available) ? { budget: workingSaveBudget, reclaim: Math.max(0, restoreReserve - available) }
    : { budget: workingSaveBudget, reclaim: 0 };
}

export async function openHistoryCache(account, { persist = true } = {}) {
  const prefix = recordKey(account, "history", "");
  const stored = (await syncStore.all(prefix).catch(() => [])).filter(record => Number.isFinite(record.node?.savedAt));
  const compare = (a, b) => b.node.savedAt - a.node.savedAt || a.id.localeCompare(b.id);
  const sizeOf = record => JSON.stringify(record).length * 2;
  stored.sort(compare);
  const retained = new Map();
  let bytes = 0;
  for (const record of stored) {
    const size = sizeOf(record);
    if (retained.size >= historyLimit || bytes + size > historyBytes) {
      if (persist) await syncStore.remove(record.id).catch(() => {});
      continue;
    }
    retained.set(record.id, record);
    bytes += size;
  }
  const memory = recentHistory.get(account) ?? new Map();
  recentHistory.clear();
  recentHistory.set(account, memory);
  let writes = Promise.resolve();
  return {
    load(id, revision) {
      const node = memory.get(id) ?? retained.get(prefix + id)?.node;
      return node?.revision === revision ? node : undefined;
    },
    save(node) {
      memory.set(node.id, node);
      if (!persist) return;
      writes = writes.then(async () => {
        const record = { id: prefix + node.id, node };
        const size = sizeOf(record);
        if (size > historyBytes) return;
        const replaced = retained.get(record.id);
        const replacedSize = replaced ? sizeOf(replaced) : 0;
        while ((!replaced && retained.size >= historyLimit) || bytes - replacedSize + size > historyBytes) {
          const oldest = [...retained.values()].filter(candidate => candidate !== replaced).sort(compare).at(-1);
          if (!oldest || compare(record, oldest) >= 0) return;
          await syncStore.remove(oldest.id);
          retained.delete(oldest.id);
          bytes -= sizeOf(oldest);
        }
        await syncStore.put(record);
        retained.set(record.id, record);
        bytes += size - replacedSize;
      }).catch(() => {});
      return writes;
    },
    retainListed(ids) {
      for (const id of memory.keys()) if (!ids.has(id)) memory.delete(id);
    },
  };
}
