import { saveLockName } from "./save-editions.mjs";

export const saveStorageEvent = "scummweb.save-storage.v1";
export const saveStorageKey = "scummweb.save-storage.changed.v1";
const indexPrefix = "scummweb.continue.v1:";
const blockId = /^[a-f0-9-]{36}$/i;
const decoder = new TextDecoder();
const encoder = new TextEncoder();

function decode(value) {
  return Uint8Array.from(atob(value), char => char.charCodeAt(0));
}

function encode(bytes) {
  let raw = "";
  for (let start = 0; start < bytes.length; start += 8192) {
    raw += String.fromCharCode(...bytes.subarray(start, start + 8192));
  }
  return btoa(raw);
}

let opening;
let factory;
function openDatabase() {
  if (!opening || factory !== indexedDB) {
    factory = indexedDB;
    opening = new Promise((resolve, reject) => {
      const request = indexedDB.open("scummweb.active-saves", 1);
      request.onupgradeneeded = () => {
        const db = request.result;
        db.createObjectStore("entries", { keyPath: "key" });
        db.createObjectStore("migration", { autoIncrement: true });
      };
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const db = request.result;
        db.onversionchange = () => { db.close(); opening = undefined; };
        db.onclose = () => { opening = undefined; };
        resolve(db);
      };
    }).catch(error => { opening = undefined; throw error; });
  }
  return opening;
}

function transaction(db, stores, mode, operation) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(stores, mode, mode === "readwrite" ? { durability: "strict" } : undefined);
    tx.onabort = () => reject(tx.error || new Error("Could not commit saved games."));
    tx.oncomplete = () => resolve(result?.result);
    let result;
    try { result = operation(tx); }
    catch (error) { tx.abort(); reject(error); }
  });
}

function announceChange() {
  // A cache invalidation signal also reaches other tabs and older host pages.
  try { localStorage.setItem(saveStorageKey, crypto.randomUUID()); } catch { /* Refresh on focus as well. */ }
  globalThis.window?.dispatchEvent(new Event(saveStorageEvent));
}

function legacySnapshot(storage) {
  const original = new Map();
  const entries = new Map();
  const seen = new Set();
  function read(key) {
    const value = storage.getItem(key);
    if (value === null) return null;
    original.set(key, value);
    try { return decode(value); } catch { return null; }
  }
  function visit(key, depth = 0) {
    if (depth > 32 || seen.has(key) || (key !== "/" && !blockId.test(key))) return false;
    seen.add(key);
    const inode = read(key);
    if (!inode || inode.length <= 30) return false;
    const dataKey = decoder.decode(inode.subarray(30));
    if (!blockId.test(dataKey) || seen.has(dataKey)) return false;
    seen.add(dataKey);
    let data = read(dataKey);
    if (!data) return false;
    const header = new DataView(inode.buffer);
    const mode = header.getUint16(4, true) & 0xf000;
    if (key === "/" && mode !== 0x4000) return false;
    if (mode === 0x4000) {
      let listing;
      try { listing = JSON.parse(decoder.decode(data)); } catch { return false; }
      if (!listing || Array.isArray(listing) || typeof listing !== "object") return false;
      const children = Object.entries(listing);
      const kept = children.filter(([, child]) => typeof child === "string" && visit(child, depth + 1));
      if (kept.length !== children.length) data = encoder.encode(JSON.stringify(Object.fromEntries(kept)));
    } else if (mode !== 0x8000 || header.getUint32(0, true) !== data.length) {
      // A readable Base64 block may still be a partial write. Keep its raw
      // bytes in the migration archive without advertising it as a save.
      return false;
    }
    entries.set(key, inode);
    entries.set(dataKey, data);
    return true;
  }
  if (storage.getItem("/") !== null && !visit("/")) {
    throw new Error("Could not read the existing save directory. The original data is still on this device.");
  }
  for (let position = 0; position < storage.length; position++) {
    const key = storage.key(position);
    if (!key || !key.startsWith(indexPrefix) && !blockId.test(key)) continue;
    const value = storage.getItem(key);
    if (value === null) continue;
    original.set(key, value);
    if (key.startsWith(indexPrefix)) entries.set(key, value);
  }
  return { original, entries };
}

async function migrate(db) {
  const migrated = () => transaction(db, "entries", "readonly", tx => tx.objectStore("entries").get("migrated"));
  if (await migrated() && localStorage.getItem("/") === null) return;
  if (!navigator.locks) throw new Error("This browser cannot safely migrate saved games.");
  await navigator.locks.request(saveLockName + ":migration", async () => {
    if (await migrated() && localStorage.getItem("/") === null) return;
    return navigator.locks.request(saveLockName, { ifAvailable: true }, async lock => {
      if (!lock) {
        const error = new Error("Another game is using save storage. Close it or wait before trying again.");
        error.name = "SaveSessionBusyError";
        throw error;
      }
      const complete = await migrated();
      if (complete && localStorage.getItem("/") === null) return;
      const { original, entries } = legacySnapshot(localStorage);
      await transaction(db, ["entries", "migration"], "readwrite", tx => {
        // Keep the source bytes independently of the active tree. A stale site
        // tab can still make a legacy write; retain its whole tree for recovery.
        if (original.size) tx.objectStore("migration").add({ original, recovery: complete ? entries : null });
        if (complete) return;
        const store = tx.objectStore("entries");
        for (const [key, value] of entries) store.put({ key, value });
        store.put({ key: "migrated", value: true });
      });
      // Release space only after the copy commits. Remove the legacy root first,
      // so an interrupted cleanup cannot leave a reachable half-cleared tree.
      if (original.get("/") === localStorage.getItem("/")) localStorage.removeItem("/");
      for (const [key, value] of original) {
        if (key !== "/" && localStorage.getItem(key) === value) localStorage.removeItem(key);
      }
      announceChange();
    });
  });
}

let migration;
export async function ensureSaveStorage() {
  const db = await openDatabase();
  if (!migration) {
    migration = migrate(db).finally(() => { migration = undefined; });
  }
  await migration;
  return db;
}

function storageView(entries, db, revision = "legacy") {
  const changes = new Map();
  let flight = Promise.resolve();
  let queued = 0;
  let failed = new Map();
  return {
    get length() { return entries.size; },
    get revision() { return revision; },
    key: position => [...entries.keys()][position] ?? null,
    keys: () => entries.keys(),
    getItem(key) {
      const value = entries.get(key);
      return value instanceof Uint8Array ? encode(value) : value ?? null;
    },
    setItem(key, value) { this.setValue(key, key.startsWith(indexPrefix) ? String(value) : decode(value)); },
    removeItem(key) {
      entries.delete(key);
      changes.set(key, null);
    },
    getBytes: key => entries.get(key),
    setValue(key, value) {
      if (entries.get(key) === value) return;
      entries.set(key, value);
      changes.set(key, value);
    },
    checkpoint() { return { entries: new Map(entries), changes: new Map(changes) }; },
    rollback(checkpoint) {
      entries = checkpoint.entries;
      changes.clear();
      for (const [key, value] of checkpoint.changes) changes.set(key, value);
    },
    isCommitted: () => !queued && !changes.size && !failed.size,
    commit() {
      if (!changes.size && (!failed.size || queued)) return flight;
      const batch = new Map(changes);
      changes.clear();
      function write() {
        const updates = new Map([...failed, ...batch]);
        const nextRevision = [...updates.keys()].some(key => !key.startsWith(indexPrefix)) ? crypto.randomUUID() : revision;
        return transaction(db, "entries", "readwrite", tx => {
          const store = tx.objectStore("entries");
          for (const [key, value] of updates) {
            if (value === null) store.delete(key);
            else store.put({ key, value });
          }
          if (nextRevision !== revision) store.put({ key: "revision", value: nextRevision });
        }).then(() => {
          failed.clear();
          revision = nextRevision;
          announceChange();
        }, error => {
          failed = updates;
          throw error;
        });
      }
      // Seal each batch before waiting. A later native save can start while
      // this transaction commits and its partial writes must stay in memory.
      const writing = queued++ ? flight.then(write, write) : write();
      flight = writing.finally(() => { queued--; });
      return flight;
    },
  };
}

// Migrate before acquiring a player or restore lock, then take a fresh view
// inside the lock. Commits touch only changed keys, including native indexes.
export async function openSaveStorage(db) {
  db ||= await ensureSaveStorage();
  const rows = await transaction(db, "entries", "readonly", tx => tx.objectStore("entries").getAll());
  const entries = new Map(rows.map(({ key, value }) => [key, value]));
  const revision = entries.get("revision") || "initial";
  entries.delete("migrated");
  entries.delete("revision");
  return storageView(entries, db, revision);
}

export async function openLegacyRecoveryStorage() {
  const db = await ensureSaveStorage();
  const rows = await transaction(db, "migration", "readonly", tx => tx.objectStore("migration").getAll());
  return rows.filter(row => row.recovery).map(row => storageView(row.recovery, db));
}
