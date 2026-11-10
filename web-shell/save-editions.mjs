export const saveLockName = "scummweb-saves";
export const editionDirectory = ".scummweb-editions";
export const saveDirectory = [".local", "share", "scummvm", "saves"];

export function editionKey(namespace, target) {
  if (namespace) return /^version-[a-f0-9]{64}$/.test(namespace) ? namespace : "";
  return typeof target === "string" && /^[a-z0-9][a-z0-9_-]{0,79}$/.test(target) ? `catalog-${target}` : "";
}

export function editionLockName(edition) {
  return `${saveLockName}:edition:${edition}`;
}

// Also used by the inline library reader. Follow only directory pointers;
// a game in another tab can be writing one of its own data blocks.
export function readSaveTree(storage, edition, namespace = "", layout = { editionDirectory, saveDirectory }) {
  function inode(key) {
    const value = key && storage.getItem(key);
    if (!value) return null;
    const binary = atob(value);
    if (binary.length <= 30) return null;
    const header = new DataView(Uint8Array.from(binary.slice(0, 30), byte => byte.charCodeAt(0)).buffer);
    return { dataKey: binary.slice(30), size: header.getUint32(0, true),
      type: header.getUint16(4, true) & 0xf000, modifiedAt: header.getFloat64(14, true) };
  }
  function directory(key) {
    const entry = inode(key);
    if (entry?.type !== 0x4000) return {};
    const bytes = Uint8Array.from(atob(storage.getItem(entry.dataKey) || ""), byte => byte.charCodeAt(0));
    return JSON.parse(new TextDecoder().decode(bytes));
  }
  const root = directory("/");
  const editions = edition ? directory(root[layout.editionDirectory]) : {};
  const editionRoot = Object.hasOwn(editions, edition) ? editions[edition] : undefined;
  let files = editionRoot ? directory(editionRoot) : root;
  for (const part of namespace ? [...layout.saveDirectory, namespace] : layout.saveDirectory) files = directory(files[part]);
  return { files, inode, editionRoot };
}

// Save conventions that differ from the native target name. Keep whole
// families together, including companion files that never appear in Continue.
const legacyNames = {
  sky: /^sky-vm\./i,
  "dreamweb-cd": /^dreamweb\./i,
  "nippon-amiga": /^(nippon|game)\.\d{3}$/i,
  "monkey4-demo": /^efmi\d{3}\.(gsv|ps2)$/i,
  "grim-demo": /^grim\d{2}\.gsv$/i,
  "pegasus-demo": /^pegasus-.*\.sav$/i,
};

export function matchesLegacySave(target, name, indexed = new Set()) {
  const lower = name.toLowerCase();
  if (/^version-[a-f0-9]{64}$/.test(lower)) return false;
  return indexed.has(lower) || Object.hasOwn(legacyNames, target) && legacyNames[target].test(name)
    || lower.startsWith(target + ".") || lower.startsWith(target) && /^-\d{2}\.sav$/.test(lower.slice(target.length));
}

export function acquireEditionSession(locks, edition) {
  if (!locks) return Promise.resolve();
  return new Promise((resolve, reject) => {
    function hold(lock, busyReason) {
      if (!lock) {
        const error = new Error("Another game or save operation is active. Close it before launching a game.");
        error.name = "SaveSessionBusyError";
        error.busyReason = busyReason;
        reject(error);
        return;
      }
      resolve();
      // Web Locks releases this when the player document goes away.
      return new Promise(() => {});
    }
    locks.request(saveLockName, { mode: edition ? "shared" : "exclusive", ifAvailable: true }, (lock) => {
      if (!lock || !edition) return hold(lock, "storage");
      return locks.request(editionLockName(edition), { mode: "exclusive", ifAvailable: true },
        (editionLock) => hold(editionLock, "edition"));
    }).catch(reject);
  });
}
