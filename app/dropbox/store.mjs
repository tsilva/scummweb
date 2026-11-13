async function operate(mode, action) {
  const db = await new Promise((resolve, reject) => {
    const request = indexedDB.open("scummweb.dropbox-sync", 1);
    request.onupgradeneeded = () => request.result.createObjectStore("records", { keyPath: "id" });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(new Error("Could not open local Dropbox save tracking."));
  });
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction("records", mode);
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
  async all(prefix) { return (await operate("readonly", (store) => store.getAll())).filter(({ id }) => id.startsWith(prefix)); },
};
