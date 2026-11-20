// A checkpoint is a single file so cloud reconciliation cannot separate native
// slot bytes from their companion files or the integrity record.
export function parseAutosave(text) {
  try {
    if (typeof text !== "string" || text.length > 3 * 1024 * 1024) return null;
    const record = JSON.parse(text);
    const { payload, checksum } = record;
    if (typeof payload !== "string" || !Number.isInteger(checksum)) return null;
    let crc = -1;
    for (let i = 0; i < payload.length; i++) {
      crc ^= payload.charCodeAt(i);
      for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
    if ((crc ^ -1) >>> 0 !== checksum) return null;
    const data = JSON.parse(payload);
    if (data.version !== 1 || !Number.isSafeInteger(data.savedAt) || data.savedAt < 0
      || !Number.isInteger(data.slot) || data.slot < 1 || data.slot > 999
      || !Array.isArray(data.files) || !data.files.length || data.files.length > 16
      || typeof data.engineId !== "string" || typeof data.gameId !== "string" || typeof data.target !== "string"
      || typeof data.extra !== "string") return null;
    const names = new Set();
    for (const file of data.files) {
      if (!/^[a-z0-9][a-z0-9._-]{0,179}$/i.test(file.name) || names.has(file.name.toLowerCase())
        || typeof file.contents !== "string" || !file.contents || !/^[a-z0-9+/]+={0,2}$/i.test(file.contents)
        || file.contents.length % 4) return null;
      names.add(file.name.toLowerCase());
    }
    return data;
  } catch { return null; }
}

export function encodeAutosave({ slot, files, engineId, gameId, target, extra = "", savedAt, progress = null }) {
  const payload = JSON.stringify({ version: 1, slot, savedAt, engineId, gameId, target, extra, progress,
    files: files.map(({ name, data }) => {
      let binary = "";
      for (let offset = 0; offset < data.length; offset += 8192) binary += String.fromCharCode(...data.subarray(offset, offset + 8192));
      return { name, contents: btoa(binary) };
    }) });
  let crc = -1;
  for (let i = 0; i < payload.length; i++) {
    crc ^= payload.charCodeAt(i);
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return JSON.stringify({ payload, checksum: (crc ^ -1) >>> 0 });
}

export function readAutosaveRing(read, match, excluded = new Set()) {
  return Array.from({ length: 3 }, (_, index) => {
    const name = `.scummweb-autosave.${index}`;
    try {
      const record = parseAutosave(read(name));
      return { name, record: record && !excluded.has(name) && match(record) ? record : null };
    } catch { return { name, record: null }; }
  }).sort((a, b) => (b.record?.savedAt ?? -1) - (a.record?.savedAt ?? -1));
}

export function installRotatingAutosaves(scope, FS, savePath, params) {
  const enabled = params.get("dropbox") === "true" && params.get("hostPlayer") === "1"
    && !params.has("agentSaveScope") && !params.has("saveQuery");
  const matches = (data, identity) => ["engineId", "gameId", "target", "extra"].every(key => data[key] === identity[key]);
  const read = name => FS.readFile(`${savePath}/${name}`, { encoding: "utf8" });
  function available() {
    const identity = scope.__scummwebSaveStatus;
    if (!enabled || !identity?.supported) return [];
    return readAutosaveRing(read, data => matches(data, identity), new Set(identity.pending))
      .filter(({ record }) => record);
  }
  let overlay;
  let attemptedStartup = false;
  let lastSavedAt = 0;
  const intervalMs = 120_000;
  let due = Date.now() + intervalMs;
  function clearOverlay() {
    if (!overlay) return;
    for (const name of overlay) {
      try { FS.unlink(`/tmp/scummweb-intro/${name}`); } catch { /* Temporary files die with the frame. */ }
    }
    overlay = null;
    delete scope.__scummwebHasIntroCheckpoint;
  }
  return {
    list() {
      return available().map(({ name, record }) => ({
        checkpoint: name, slot: record.slot, modifiedAt: record.savedAt, writable: false,
      }));
    },
    find(name) { return available().find(entry => entry.name === name)?.record; },
    due() {
      if (scope.__scummwebReadyState?.state === "ready") clearOverlay();
      return enabled && scope.__scummwebSaveStatus?.supported === true
        && scope.__scummwebReadyState?.state === "ready" && Date.now() >= due;
    },
    retry() { due = Date.now() + 5000; },
    afterLoad() { due = 0; },
    startup(identity, manualSave) {
      if (!enabled || !identity.supported || attemptedStartup || params.get("continue") !== "1") return -1;
      attemptedStartup = true;
      const excluded = new Set([...(identity.pending || []), ...(params.get("excludeAutosaves") || "").split(",")]);
      for (const { name, record } of readAutosaveRing(read, data => matches(data, identity), excluded)) {
        if (!record || scope.__scummwebHasIntroCheckpoint) continue;
        if (manualSave && record.savedAt <= manualSave.modifiedAt) break;
        try {
          try { FS.mkdir("/tmp/scummweb-intro"); } catch { /* Directory may already exist. */ }
          overlay = new Set();
          for (const file of record.files) {
            const bytes = Uint8Array.from(atob(file.contents), char => char.charCodeAt(0));
            FS.writeFile(`/tmp/scummweb-intro/${file.name}`, bytes);
            overlay.add(file.name);
          }
          scope.__scummwebHasIntroCheckpoint = name => overlay?.has(name) && !scope.__scummwebScanningSaves;
          scope.__scummwebStartupAutosave = name;
          due = 0;
          return record.slot;
        } catch { clearOverlay(); }
      }
      return -1;
    },
    save(result, slot) {
      const identity = scope.__scummwebSaveStatus;
      if (!enabled || !identity || result.status !== "captured") return false;
      const ring = readAutosaveRing(read, data => matches(data, identity));
      const name = ring.at(-1).name;
      const savedAt = Math.max(Date.now(), lastSavedAt + 1, (ring[0].record?.savedAt ?? 0) + 1);
      const contents = encodeAutosave({ ...identity, ...result, slot, savedAt,
        progress: scope.__scummwebReadAutosaveProgress?.() ?? null });
      if (!parseAutosave(contents)) return false;
      const storage = scope.__scummwebSaveStorage;
      const checkpoint = storage?.checkpoint();
      try {
        FS.writeFile(`${savePath}/${name}`, contents);
        if (read(name) !== contents) throw new Error("Incomplete autosave");
      } catch {
        if (checkpoint) storage.rollback(checkpoint);
        return false;
      }
      lastSavedAt = savedAt;
      due = Date.now() + intervalMs;
      return true;
    },
  };
}
