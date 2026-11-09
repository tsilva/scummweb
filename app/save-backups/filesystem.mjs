// BrowserFS 2's LocalStorage format. Publish a changed tree by swapping only
// the root inode, so quota failures cannot leave half an imported save set.
const saveParts = [".local", "share", "scummvm", "saves"];
const encoder = new TextEncoder();
const decoder = new TextDecoder();

export function encodeBytes(bytes) {
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 8192) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 8192));
  }
  return btoa(binary);
}

export function decodeBytes(value) {
  return Uint8Array.from(atob(value), (byte) => byte.charCodeAt(0));
}

export function safePath(path) {
  return typeof path === "string" && path.length <= 512 && !/[\\\x00-\x1f\x7f]/.test(path)
    && path.split("/").length <= 24
    && path.split("/").every((part) => part && ![".", "..", "__proto__", "constructor", "prototype", "hasOwnProperty"].includes(part) && !part.includes(":"));
}

export function captureFilesystem(storage) {
  const values = new Map();
  const seen = new Set();
  function value(key) {
    const data = storage.getItem(key);
    if (data === null) throw new Error("Browser save storage is incomplete. Export your existing data before repairing it.");
    values.set(key, data);
    return data;
  }
  function read(key, depth = 0) {
    if (depth > 32 || seen.has(key) || seen.size > 20000) throw new Error("Browser save storage contains an invalid directory.");
    seen.add(key);
    const bytes = decodeBytes(value(key));
    if (bytes.length <= 30) throw new Error("Browser save storage contains an invalid file.");
    const meta = new DataView(bytes.buffer);
    const mode = meta.getUint16(4, true);
    const data = decodeBytes(value(decoder.decode(bytes.subarray(30))));
    const node = { key, mode, modifiedAt: meta.getFloat64(14, true) };
    if ((mode & 0xf000) === 0x4000) {
      node.children = new Map();
      for (const [name, child] of Object.entries(JSON.parse(decoder.decode(data)))) {
        if (!safePath(name) || name.includes("/")) throw new Error("Browser save storage contains an invalid name.");
        node.children.set(name, read(child, depth + 1));
      }
    } else if ((mode & 0xf000) === 0x8000) node.data = data;
    else throw new Error("Unsupported file type in browser save storage.");
    return node;
  }
  const rootValue = storage.getItem("/");
  const root = rootValue === null ? { children: new Map(), mode: 0x41ff } : read("/");
  values.set("/", rootValue);
  const revision = JSON.stringify([...values].sort(([a], [b]) => a.localeCompare(b)));
  let saves = root;
  for (const part of saveParts) saves = saves?.children?.get(part);
  const files = [];
  function walk(node, prefix = "") {
    for (const [name, child] of node?.children || []) {
      const path = prefix + name;
      if (child.children) walk(child, path + "/");
      else files.push({ path, data: child.data, modifiedAt: child.modifiedAt });
    }
  }
  walk(saves);
  return { root, files, values, revision };
}

export function restoreSaveGroups(storage, updates, expectedRevision, initialConfig) {
  const snapshot = captureFilesystem(storage);
  if (snapshot.revision !== expectedRevision) throw new Error("Saves changed after the review opened. Review the backup again.");
  if (!updates.length) return;
  const dirty = new Set([snapshot.root]);
  const directory = () => ({ children: new Map(), mode: 0x41ff, modifiedAt: Date.now() });
  if (!snapshot.root.key) {
    if (!initialConfig) throw new Error("Could not initialize save storage. Try again when online.");
    snapshot.root.children.set("scummvm.ini", { data: encoder.encode(initialConfig), mode: 0x81b6, modifiedAt: Date.now() });
  }
  function descend(node, parts) {
    dirty.add(node);
    for (const part of parts) {
      let child = node.children.get(part);
      if (!child) node.children.set(part, child = directory());
      if (!child.children) throw new Error("A file blocks the save directory.");
      dirty.add(child);
      node = child;
    }
    return node;
  }
  const saves = descend(snapshot.root, saveParts);
  for (const { namespace, matches, files } of updates) {
    if (namespace && !/^version-[a-f0-9]{64}$/.test(namespace)) throw new Error("Invalid save destination.");
    const target = namespace ? descend(saves, [namespace]) : saves;
    for (const name of target.children.keys()) if (namespace || matches(name)) target.children.delete(name);
    for (const file of files) {
      if (!safePath(file.path)) throw new Error("Invalid save filename.");
      const parts = file.path.split("/");
      const parent = descend(target, parts.slice(0, -1));
      parent.children.set(parts.at(-1), { data: file.data, mode: 0x81b6, modifiedAt: file.modifiedAt });
    }
  }
  const staged = [];
  const retained = new Set();
  const now = Date.now();
  let nodeCount = 0;
  function validateTree(node, depth = 0) {
    if (++nodeCount > 20000 || depth > 32) throw new Error("This backup would create too many save directories.");
    for (const child of node.children?.values() || []) validateTree(child, depth + 1);
  }
  validateTree(snapshot.root);
  function put(key, value) {
    staged.push(key);
    storage.setItem(key, value);
  }
  function persist(node, isRoot = false) {
    if (node.key && !dirty.has(node)) return node.key;
    const key = isRoot ? "/" : crypto.randomUUID();
    const dataKey = crypto.randomUUID();
    const data = node.children ? encoder.encode(JSON.stringify(Object.fromEntries(
      [...node.children].map(([name, child]) => [name, persist(child)])
    ))) : node.data;
    put(dataKey, encodeBytes(data));
    const inode = new Uint8Array(30 + dataKey.length);
    const view = new DataView(inode.buffer);
    view.setUint32(0, node.children ? 4096 : data.length, true);
    view.setUint16(4, node.mode, true);
    view.setFloat64(6, now, true);
    view.setFloat64(14, Number.isFinite(node.modifiedAt) ? node.modifiedAt : now, true);
    view.setFloat64(22, now, true);
    inode.set(encoder.encode(dataKey), 30);
    if (isRoot) return encodeBytes(inode);
    put(key, encodeBytes(inode));
    return key;
  }
  try {
    const rootInode = persist(snapshot.root, true);
    for (const [key, oldValue] of snapshot.values) {
      if (storage.getItem(key) !== oldValue) throw new Error("Saves changed during import. Close other games and retry.");
    }
    // Every new data block is durable before the only visible pointer changes.
    storage.setItem("/", rootInode);
  } catch (error) {
    for (const key of staged) storage.removeItem(key);
    if (error.name === "QuotaExceededError") throw new Error("Not enough browser storage to restore safely. Your current saves are unchanged.");
    throw error;
  }
  // Remove only nodes made unreachable by this root swap, never other app data.
  for (const key of captureFilesystem(storage).values.keys()) retained.add(key);
  for (const key of snapshot.values.keys()) if (!retained.has(key)) storage.removeItem(key);
}
