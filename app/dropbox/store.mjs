async function operate(mode, action) {
  const db = await new Promise((resolve, reject) => {
    const request = indexedDB.open("scummweb.dropbox-sync", 1);
    request.onupgradeneeded = () => request.result.createObjectStore("records", { keyPath: "id" });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(new Error("Could not open local Dropbox save tracking."));
  });
  try {
    return await new Promise((resolve, reject) => {
      // Request a disk flush before acknowledging an outbox/baseline commit.
      // Older browsers may not implement the durability option.
      let tx;
      try { tx = db.transaction("records", mode, { durability: "strict" }); }
      catch (error) { if (!(error instanceof TypeError)) throw error; tx = db.transaction("records", mode); }
      let request;
      tx.oncomplete = () => resolve(request?.result);
      tx.onabort = tx.onerror = () => reject(new Error("Could not retain pending Dropbox saves on this device."));
      request = action(tx.objectStore("records"));
    });
  } finally { db.close(); }
}
export const syncStore = {
  get: (id) => operate("readonly", (store) => store.get(id)),
  put: (record) => operate("readwrite", (store) => store.put(record)),
  remove: (id) => operate("readwrite", (store) => store.delete(id)),
  removeIf: (id, predicate) => operate("readwrite", (store) => {
    const request = store.get(id);
    request.onsuccess = () => { if (request.result && predicate(request.result)) store.delete(id); };
    return request;
  }),
  putIf: (record, predicate) => operate("readwrite", (store) => {
    const request = store.get(record.id);
    request.onsuccess = () => { if (request.result && predicate(request.result)) store.put(record); };
    return request;
  }),
  all(prefix) {
    return operate("readonly", (store) => store.getAll(IDBKeyRange.bound(prefix, `${prefix}\uffff`, false, true)));
  },
};
