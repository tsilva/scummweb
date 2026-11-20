export const localActivityUpdatedEvent = "scummweb:local-activity-updated";
export const localActivitySignalKey = "scummweb.local-activity-changed";

const playHistoryPrefix = "scummweb.play-history.v1:";
const storyProgressPrefix = "scummweb.story-progress.v1:";
const migrationKey = "";
const databases = new WeakMap();

function legacyActivity(scope) {
  const records = new Map();
  try {
    const storage = scope.localStorage;
    for (let index = 0; index < storage.length; index++) {
      const key = storage.key(index);
      const isPlay = key?.startsWith(playHistoryPrefix);
      if (!isPlay && !key?.startsWith(storyProgressPrefix)) continue;
      const version = key.slice((isPlay ? playHistoryPrefix : storyProgressPrefix).length);
      if (!version) continue;
      let value;
      try { value = JSON.parse(storage.getItem(key)); } catch { continue; }
      const record = records.get(version) ?? { id: version };
      if (isPlay && Number.isSafeInteger(value?.playedMs) && value.playedMs >= 0 &&
          Number.isSafeInteger(value.lastPlayedAt) && value.lastPlayedAt > 0 && value.lastPlayedAt <= 8.64e15) {
        record.history = { playedMs: value.playedMs, lastPlayedAt: value.lastPlayedAt };
      } else if (!isPlay && typeof value?.slug === "string" && typeof value.revision === "string" &&
          Number.isInteger(value.percent) && value.percent >= 0 && value.percent <= 100) {
        record.story = { slug: value.slug, revision: value.revision, percent: value.percent };
      }
      if (record.history || record.story) records.set(version, record);
    }
  } catch { /* Activity can still be recorded when legacy storage is blocked. */ }
  return records;
}

function transaction(db, mode, action) {
  return new Promise((resolve, reject) => {
    let tx;
    try { tx = db.transaction("records", mode, mode === "readwrite" ? { durability: "strict" } : undefined); }
    catch (error) {
      if (!(error instanceof TypeError)) throw error;
      tx = db.transaction("records", mode);
    }
    tx.onabort = () => reject(tx.error || new Error("Could not commit player activity."));
    const request = action(tx.objectStore("records"));
    tx.oncomplete = () => resolve(request?.result);
  });
}

function openActivityStorage(scope) {
  if (!databases.has(scope)) {
    const opening = new Promise((resolve, reject) => {
      const request = scope.indexedDB.open("scummweb.player-activity", 1);
      request.onupgradeneeded = () => request.result.createObjectStore("records", { keyPath: "id" });
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
    }).then(async (db) => {
      db.onversionchange = () => { databases.delete(scope); db.close(); };
      db.onclose = () => { databases.delete(scope); };
      try {
        await transaction(db, "readwrite", (store) => {
          const marker = store.get(migrationKey);
          marker.onsuccess = () => {
            if (marker.result) return;
            for (const record of legacyActivity(scope).values()) store.put(record);
            store.put({ id: migrationKey });
          };
        });
        return db;
      } catch (error) {
        db.close();
        throw error;
      }
    }).catch((error) => {
      if (databases.get(scope) === opening) databases.delete(scope);
      throw error;
    });
    databases.set(scope, opening);
  }
  return databases.get(scope);
}

export async function readLocalActivity(scope) {
  const db = await openActivityStorage(scope);
  const records = await transaction(db, "readonly", (store) => store.getAll());
  return new Map(records.filter(({ id }) => id !== migrationKey).map((record) => [record.id, record]));
}

function notifyChange(scope) {
  // Only a change signal goes to localStorage so already-open library tabs refresh.
  try { scope.localStorage.setItem(localActivitySignalKey, crypto.randomUUID()); } catch {}
  scope.dispatchEvent(new Event(localActivityUpdatedEvent));
}

async function updateRecord(scope, version, update) {
  const db = await openActivityStorage(scope);
  let changed = false;
  await transaction(db, "readwrite", (store) => {
    const request = store.get(version);
    request.onsuccess = () => {
      const next = update(request.result ?? { id: version });
      if (next) {
        store.put(next);
        changed = true;
      }
    };
  });
  if (changed) notifyChange(scope);
}

export function addPlayedTime(scope, version, elapsed, date) {
  return updateRecord(scope, version, (record) => ({ ...record, history: {
    playedMs: Math.min(Number.MAX_SAFE_INTEGER, (record.history?.playedMs ?? 0) + elapsed),
    lastPlayedAt: Math.max(record.history?.lastPlayedAt ?? 0, date),
  } }));
}

export function updateStoryMilestone(scope, version, { slug, revision, percent }) {
  return updateRecord(scope, version, (record) => {
    const story = record.story;
    const matching = story?.slug === slug && story.revision === revision;
    if (percent === null) {
      if (!matching) return;
      delete record.story;
    } else {
      if (matching && story.percent >= percent) return;
      record.story = { slug, revision, percent };
    }
    return record;
  });
}

export async function copyLocalActivity(scope, previous, next) {
  const db = await openActivityStorage(scope);
  let changed = false;
  await transaction(db, "readwrite", (store) => {
    const source = store.get(previous);
    source.onsuccess = () => {
      if (!source.result) return;
      const destination = store.get(next);
      destination.onsuccess = () => {
        const { history, story } = source.result;
        const existing = destination.result ?? { id: next };
        if ((!history || existing.history) && (!story || existing.story)) return;
        store.put({ ...source.result, ...existing });
        changed = true;
      };
    };
  });
  if (changed) notifyChange(scope);
}
