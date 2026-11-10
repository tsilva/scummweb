import { captureFilesystem, restoreSaveGroups, safePath } from "./filesystem.mjs";
import { getVersionSaveNamespace } from "../game-versions.mjs";
import { saveIndexPrefix } from "../../web-shell/continue-saves.mjs";
import { editionKey, saveLockName } from "../../web-shell/save-editions.mjs";

export { saveLockName };
const maxBytes = 64 * 1024 * 1024;
const maxFiles = 4096;
const rootFamilies = [
  ["sky", /^SKY-VM\./i], ["queen", /^queen\./i], ["lure", /^lure\./i],
  ["drascula", /^drascula\./i], ["dreamweb-cd", /^DREAMWEB\./i],
];
function rootFamily(name) {
  if (/^version-[a-f0-9]{64}$/.test(name)) return "namespace";
  return rootFamilies.find(([, pattern]) => pattern.test(name))?.[0] || "shared";
}
export function destinationMatches(destination, name) { return rootFamily(name) === destination.family; }

async function digest(bytes) {
  return Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)), (byte) => byte.toString(16).padStart(2, "0")).join("");
}
export async function identifySet(set) {
  const parts = await Promise.all(set.files.map(async (file) => [file.path, await digest(file.data)]));
  return digest(new TextEncoder().encode(JSON.stringify(parts.sort(([a], [b]) => a.localeCompare(b)))));
}

export async function getSaveDestinations(catalog, sources) {
  const included = catalog.flatMap((game) => {
    const family = game.target === "dreamweb" ? "dreamweb-cd" : game.target;
    return editionKey("", family) ? [{ key: `catalog:${family}`, title: game.displayTitle, family, namespace: "" }] : [];
  });
  const imported = await Promise.all(sources.map(async (source) => ({
    key: await getVersionSaveNamespace(source.id), namespace: await getVersionSaveNamespace(source.id),
    title: source.name.replace(/\.zip$/i, ""), fingerprint: source.fingerprint || null,
  })));
  return [...included, ...imported, { key: "shared", title: "Other shared saves", namespace: "", family: "shared" }];
}

export async function getActiveSaveSets(storage, destinations) {
  const snapshot = captureFilesystem(storage);
  const groups = new Map();
  for (const file of snapshot.files) {
    const [first, ...rest] = file.path.split("/");
    const namespace = /^version-[a-f0-9]{64}$/.test(first) ? first : "";
    const family = namespace ? null : rootFamily(first);
    const destination = destinations.find((item) => namespace ? item.namespace === namespace : item.family === family)
      || { key: namespace || "shared", namespace, family, title: "Unmatched imported game" };
    if (!groups.has(destination.key)) groups.set(destination.key, { destination, files: [] });
    groups.get(destination.key).files.push({ ...file, path: namespace ? rest.join("/") : file.path });
  }
  const isolatedSets = [];
  for (const [edition, files] of snapshot.editions) {
    if (!files.length) continue;
    const catalog = edition.startsWith("catalog-");
    const family = catalog ? edition.slice("catalog-".length) : null;
    const key = catalog ? `catalog:${family}` : edition;
    const destination = destinations.find((item) => item.key === key)
      || { key, family, namespace: catalog ? "" : edition, title: family || "Unmatched imported game" };
    isolatedSets.push({ destination: catalog ? { ...destination, isolated: true } : destination, files });
  }
  const sets = await Promise.all([...isolatedSets, ...groups.values()].map(async (set) => ({ ...set, hash: await identifySet(set) })));
  return { sets, editionKeys: new Set(snapshot.editions.keys()), revision: snapshot.revision };
}

export async function exportBackup(sets) {
  if (!sets.length) throw new Error("There are no saved games to export yet.");
  const files = sets.flatMap((set) => set.files);
  if (sets.length > 1000 || files.length > maxFiles || files.reduce((total, file) => total + file.data.length, 0) > maxBytes - 1024 * 1024) {
    throw new Error("This collection exceeds the 64 MiB save-backup limit.");
  }
  const { ZipWriter, BlobWriter, Uint8ArrayReader, TextReader } = await import("@zip.js/zip.js");
  const writer = new ZipWriter(new BlobWriter("application/zip"), { useWebWorkers: false, level: 0 });
  const manifest = { format: "scummweb-save-backup", version: 1, createdAt: new Date().toISOString(), sets: [] };
  for (const [index, set] of sets.entries()) {
    const files = [];
    for (const [number, file] of set.files.entries()) {
      const entry = `saves/${index}/${number}`;
      await writer.add(entry, new Uint8ArrayReader(file.data));
      files.push({ path: file.path, entry, modifiedAt: file.modifiedAt, sha256: await digest(file.data) });
    }
    manifest.sets.push({ destination: set.destination, files });
  }
  await writer.add("manifest.json", new TextReader(JSON.stringify(manifest)));
  return writer.close();
}

function validateDestination(value) {
  if (!value || typeof value.key !== "string" || value.key.length > 100 || typeof value.title !== "string"
    || value.title.length > 200 || /[\x00-\x1f]/.test(value.title)) throw new Error("Invalid game information in backup.");
  if (value.namespace) {
    if (!/^version-[a-f0-9]{64}$/.test(value.namespace) || value.key !== value.namespace) throw new Error("Invalid imported-game identity.");
  } else if (value.isolated === true) {
    if (!editionKey("", value.family) || value.key !== `catalog:${value.family}`) throw new Error("Invalid catalog edition.");
  } else if (!(value.key === "shared" && value.family === "shared")
    && !rootFamilies.some(([family]) => value.key === `catalog:${family}` && value.family === family)) {
    throw new Error("Invalid shared-save identity.");
  }
  if (value.fingerprint != null && !/^[a-f0-9]{64}$/.test(value.fingerprint)) throw new Error("Invalid game fingerprint.");
  return { key: value.key, title: value.title, namespace: value.namespace || "", family: value.family || null,
    fingerprint: value.fingerprint || null, ...(!value.namespace && value.isolated === true && { isolated: true }) };
}

export async function readBackup(file) {
  if (!file || file.size > maxBytes) throw new Error("Choose a save backup ZIP of 64 MiB or less.");
  const { ZipReader, BlobReader, Uint8ArrayWriter } = await import("@zip.js/zip.js");
  const reader = new ZipReader(new BlobReader(file), { useWebWorkers: false });
  try {
    const entries = new Map();
    let total = 0;
    let count = 0;
    for await (const entry of reader.getEntriesGenerator()) {
      if (++count > maxFiles + 1) throw new Error("This backup contains too many files.");
      if (!safePath(entry.filename) || entries.has(entry.filename) || entry.directory || entry.encrypted || entry.symlink) {
        throw new Error("This backup contains unsupported or duplicate entries.");
      }
      total += entry.uncompressedSize;
      if (!Number.isSafeInteger(total) || total > maxBytes) throw new Error("This backup exceeds 64 MiB when unpacked.");
      entries.set(entry.filename, entry);
    }
    const manifestEntry = entries.get("manifest.json");
    if (!manifestEntry || manifestEntry.uncompressedSize > 1024 * 1024) throw new Error("Choose a ScummWEB save backup ZIP.");
    async function read(entry) {
      const data = await entry.getData(new Uint8ArrayWriter(), { checkSignature: true,
        onprogress: (loaded) => { if (loaded > maxBytes) throw new Error("Save file is too large."); } });
      if (data.length !== entry.uncompressedSize) throw new Error("A backup file has an invalid size.");
      return data;
    }
    const manifest = JSON.parse(new TextDecoder().decode(await read(manifestEntry)));
    if (manifest.format !== "scummweb-save-backup" || manifest.version !== 1) throw new Error("This save backup format is not supported.");
    if (!Array.isArray(manifest.sets) || !manifest.sets.length || manifest.sets.length > 1000) throw new Error("Invalid save sets in backup.");
    const referenced = new Set(["manifest.json"]);
    const sets = [];
    for (const item of manifest.sets) {
      const destination = validateDestination(item.destination);
      if (!Array.isArray(item.files) || !item.files.length || item.files.length > maxFiles) throw new Error("Invalid files in backup.");
      const names = new Set();
      const files = [];
      for (const fileInfo of item.files) {
        const path = fileInfo.path;
        const entry = entries.get(fileInfo.entry);
        if (!safePath(path) || names.has(path.toLowerCase()) || !entry || referenced.has(fileInfo.entry)
          || !Number.isFinite(fileInfo.modifiedAt) || fileInfo.modifiedAt < 0 || !/^[a-f0-9]{64}$/.test(fileInfo.sha256)) {
          throw new Error("Invalid or duplicate save filename in backup.");
        }
        // A shared bundle must never overwrite another game's files or a namespace.
        if (!destination.namespace && !destination.isolated && !destinationMatches(destination, path.split("/")[0])) {
          throw new Error("A save file does not belong to its game.");
        }
        names.add(path.toLowerCase());
        referenced.add(fileInfo.entry);
        const data = await read(entry);
        if (await digest(data) !== fileInfo.sha256) throw new Error("A save file failed its integrity check.");
        files.push({ path, data, modifiedAt: fileInfo.modifiedAt });
      }
      const set = { destination, files };
      sets.push({ ...set, hash: await identifySet(set) });
    }
    if (referenced.size !== entries.size) throw new Error("This backup contains unexpected files.");
    return sets;
  } catch (error) {
    if (error instanceof SyntaxError) throw new Error("This backup has an invalid manifest.");
    throw error;
  } finally { await reader.close(); }
}

export function matchDestination(set, destinations) {
  if (set.destination.fingerprint) {
    const matches = destinations.filter((item) => item.fingerprint === set.destination.fingerprint);
    if (matches.length === 1) return matches[0].key;
  }
  return destinations.find((item) => item.key === set.destination.key)?.key || "";
}

async function withSetStore(mode, operation) {
  const db = await new Promise((resolve, reject) => {
    const request = indexedDB.open("scummweb.save-backups", 1);
    request.onupgradeneeded = () => request.result.createObjectStore("sets", { keyPath: "id" });
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
  });
  try {
    return await new Promise((resolve, reject) => {
      const transaction = db.transaction("sets", mode);
      let result;
      transaction.oncomplete = () => resolve(result?.result);
      transaction.onabort = () => reject(transaction.error || new Error("Could not preserve the save sets."));
      result = operation(transaction.objectStore("sets"));
    });
  } finally { db.close(); }
}
export function readStoredSets() { return withSetStore("readonly", (store) => store.getAll()); }
export async function preserveSets(sets) {
  return withSetStore("readwrite", (store) => {
    for (const set of sets) store.put({ ...set, id: `${set.destination.key}:${set.hash}`, preservedAt: Date.now() });
  });
}

export async function withSaveLock(action) {
  if (!navigator.locks) throw new Error("This browser cannot safely restore saves. Use a browser with Web Locks support.");
  return navigator.locks.request(saveLockName, { mode: "exclusive", ifAvailable: true }, async (lock) => {
    if (!lock) throw new Error("Close games in all ScummWEB tabs before exporting or restoring saves.");
    return action();
  });
}

export async function applyImport({ storage, rows, destinations, revision, initialConfig, preserve = preserveSets }) {
  const current = await getActiveSaveSets(storage, destinations);
  if (current.revision !== revision) throw new Error("Saves changed after review. Open the backup again before importing.");
  const archived = [];
  const updates = [];
  const updated = new Set();
  for (const row of rows) {
    const destination = destinations.find(({ key }) => key === row.destinationKey);
    const isolated = row.set.destination.isolated === true;
    const imported = { ...row.set, destination: destination ? { ...destination, ...(isolated && { isolated }) } : row.set.destination };
    if (!destination) { archived.push(imported); continue; }
    const activeSets = current.sets.filter((set) => set.destination.key === destination.key);
    const [active] = activeSets;
    if (active?.hash === imported.hash) continue;
    archived.push(imported);
    archived.push(...activeSets);
    if (row.choice === "stored") continue;
    if (active && row.choice !== "imported") continue;
    if (updated.has(destination.key)) throw new Error("Activate only one save set per game. Keep the others as separate sets.");
    updated.add(destination.key);
    if (!destination.namespace && !isolated && imported.files.some(({ path }) => !destinationMatches(destination, path.split("/")[0]))) {
      throw new Error("These files cannot be restored to that shared game. Choose the matching imported version instead.");
    }
    const edition = destination.key === "shared" ? "" : editionKey(destination.namespace, destination.family);
    updates.push({ edition: isolated || current.editionKeys.has(edition) ? edition : "",
      namespace: destination.namespace, matches: (name) => destinationMatches(destination, name), files: imported.files });
  }
  // Preserve both sides durably before any active files change.
  await preserve(archived);
  if (updates.length && typeof storage.key === "function") {
    // Native save metadata belongs to the old bytes, even if sizes/times match.
    // Invalidate BEFORE the root swap so interruption cannot leave an old
    // positive record attached to replacement bytes. Failed restores can repair
    // the now-missing index in the background without changing player files.
    const keys = Array.from({ length: storage.length }, (_, index) => storage.key(index));
    for (const key of keys) if (key?.startsWith(saveIndexPrefix)) storage.removeItem(key);
  }
  restoreSaveGroups(storage, updates, revision, initialConfig);
}
