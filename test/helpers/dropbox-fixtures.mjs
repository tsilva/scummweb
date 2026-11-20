export function memoryStorage() {
  const values = new Map();
  return { values, get length() { return values.size; }, key: (index) => [...values.keys()][index] ?? null,
    getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, String(value)), removeItem: (key) => values.delete(key) };
}

export function browserSaveStorage(files = {}) {
  const storage = memoryStorage();
  const bytes = (text) => new TextEncoder().encode(text);
  const blockKey = () => crypto.randomUUID();
  function inode(tree, key) {
    const directory = !(tree instanceof Uint8Array);
    const dataKey = blockKey();
    const data = directory ? bytes(JSON.stringify(Object.fromEntries(Object.entries(tree).map(([name, child]) => {
      const childKey = blockKey();
      inode(child, childKey);
      return [name, childKey];
    })))) : tree;
    const header = Buffer.alloc(30);
    header.writeUInt32LE(directory ? 4096 : data.length, 0);
    header.writeUInt16LE(directory ? 0x41ff : 0x81ff, 4);
    header.writeDoubleLE(100, 14);
    storage.setItem(key, Buffer.concat([header, Buffer.from(dataKey)]).toString("base64"));
    storage.setItem(dataKey, Buffer.from(data).toString("base64"));
  }
  inode({ "scummvm.ini": bytes("[scummvm]\n"), ".local": { share: { scummvm: { saves: files } } } }, "/");
  return storage;
}

// A small asynchronous IndexedDB fixture covering only these stores' operations.
export function indexedDbFixture() {
  const databases = new Map();
  const tails = new Map();
  const durability = [];
  const fixture = { databases, durability, open(name) {
    const request = {};
    queueMicrotask(() => {
      const fresh = !databases.has(name);
      if (fresh) databases.set(name, new Map());
      const tables = databases.get(name);
      request.result = {
        createObjectStore(table) { tables.set(table, new Map()); }, close() {},
        transaction(names, mode, options) {
          durability.push({ name, table: names, mode, durability: options?.durability });
          const writes = [];
          const ready = tails.get(name) ?? Promise.resolve();
          let finish;
          tails.set(name, new Promise((resolve) => { finish = resolve; }));
          let aborted = false;
          const tx = {
            abort() { aborted = true; },
            objectStore(table = names) {
              const records = tables.get(table);
              function put(record, key) {
                writes.push({ table, key, record: structuredClone(record) });
                return { result: key };
              }
              function read(value) {
                const request = {};
                void ready.then(() => {
                  request.result = structuredClone(value());
                  request.onsuccess?.();
                });
                return request;
              }
              return { get: (key) => read(() => records.get(key)),
                getAll: (range) => read(() => [...records.values()].filter(({ id }) =>
                  !range || id >= range.lower && id < range.upper)),
                put: (record) => put(record, record.id ?? record.key),
                add: (record) => put(record, records.size + 1),
                delete: (key) => { writes.push({ table, key }); return {}; } };
            },
          };
          void ready.then(() => setTimeout(() => {
            try {
              tx.error = fixture.fail?.({ name, names, mode, writes });
              if (aborted || tx.error) { tx.onabort?.(); return; }
              for (const { table, key, record } of writes) {
                if (record === undefined) tables.get(table).delete(key);
                else tables.get(table).set(key, record);
              }
              tx.oncomplete?.();
            } finally {
              finish();
            }
          }, 0));
          return tx;
        },
      };
      if (fresh) request.onupgradeneeded?.();
      request.onsuccess?.();
    });
    return request;
  } };
  return fixture;
}


export function fakeNativeStorage() {
  const files = new Map();
  const revisions = new WeakMap();
  let nextRevision = 0;
  return { files,
    offline: false, uploads: 0, failAfterUpload: false, onUpload: null,
    close() {}, async list() { if (this.offline) throw new Error("Offline"); return [...files.keys()]; },
    revision(name) {
      const file = files.get(name);
      if (!file) return undefined;
      if (!revisions.has(file)) revisions.set(file, String(++nextRevision));
      return revisions.get(file);
    },
    async download(name) { if (this.offline) throw new Error("Offline"); if (!files.has(name)) throw new Error("Missing"); return files.get(name); },
    async upload(name, blob) {
      if (this.offline) throw new Error("Offline");
      this.uploads++; files.set(name, blob);
      this.onUpload?.();
      if (this.failAfterUpload) { this.failAfterUpload = false; throw new Error("Killed after commit"); }
    },
  };
}

// Exercise the real browser/native bridge boundary with synthetic native replies.
export function nativeCloudBrowser(server, storage) {
  const events = new EventTarget();
  const origin = "https://example.test";
  const frames = new Set();
  function dispatch(source, data, eventOrigin = origin) {
    const event = new Event("message");
    Object.assign(event, { origin: eventOrigin, source, data: { type: "scummweb:cloud", ...data } });
    events.dispatchEvent(event);
  }
  const window = { localStorage: storage, dispatchEvent: events.dispatchEvent.bind(events),
    addEventListener: events.addEventListener.bind(events), removeEventListener: events.removeEventListener.bind(events) };
  const document = { hidden: false, addEventListener: events.addEventListener.bind(events), removeEventListener: events.removeEventListener.bind(events),
    dispatchEvent: events.dispatchEvent.bind(events), body: { append(frame) {
    frames.add(frame); setTimeout(() => dispatch(frame.contentWindow, { op: "booted" }), 0);
  } }, createElement() {
    let config;
    const frame = { setAttribute() {}, remove() { frames.delete(frame); }, contentWindow: { postMessage(data) {
      setTimeout(async () => {
        try {
          await server.onRequest?.(data, (progress) => dispatch(frame.contentWindow, { id: data.id, ...progress }));
          let result = {};
          if (data.op === "init") config = data.config;
          else if (data.op === "refresh") { if (server.offline) throw new Error("Offline"); config += "\n# renewed\n"; }
          else if (data.op === "list") result = { entries: (await server.list()).map((name) => ({ name, size: server.files.get(name).size, revision: server.revision?.(name) })) };
          else if (data.op === "upload") await server.upload(data.name, new Blob([data.bytes]));
          else if (data.op === "download") result = { bytes: new Uint8Array(await (await server.download(data.name)).arrayBuffer()) };
          dispatch(frame.contentWindow, { id: data.id, ok: true, config, ...result });
        } catch { dispatch(frame.contentWindow, { id: data.id, ok: false, kind: "request", config }); }
      }, 0);
    } } };
    return frame;
  } };
  return { window, document, location: { origin }, frames, dispatch };
}
