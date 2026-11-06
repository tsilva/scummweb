// Self-contained for the small pre-paint reader as well as React's save hook.
// Only indexed, complete files in the selected edition can offer Continue.
export function readCachedSave(game, storage, namespace = "") {
  try {
    if (namespace === null) return null;
    function inode(key) {
      const raw = key && storage.getItem(key);
      if (!raw) return null;
      const bytes = atob(raw);
      if (bytes.length <= 30) return null;
      const header = new DataView(Uint8Array.from(bytes.slice(0, 30), c => c.charCodeAt(0)).buffer);
      return { key: bytes.slice(30), size: header.getUint32(0, true),
        type: header.getUint16(4, true) & 0xf000, modifiedAt: header.getFloat64(14, true) };
    }
    function directory(key) {
      const entry = inode(key);
      if (entry?.type !== 0x4000) return {};
      return JSON.parse(new TextDecoder().decode(Uint8Array.from(
        atob(storage.getItem(entry.key) || ""), c => c.charCodeAt(0))));
    }
    const index = JSON.parse(storage.getItem("scummweb.continue.v1:" + (namespace || `catalog:${game.target}`)));
    if (index?.schemaVersion !== 1 || !index.supported || !Array.isArray(index.saves)
      || (index.pending != null && !Array.isArray(index.pending))) return null;
    if (!namespace && (index.target !== (game.nativeTarget || game.target)
      || (game.engineId && index.engineId !== game.engineId)
      || (game.gameId && index.gameId !== game.gameId)
      || (game.extra && index.extra?.toLowerCase() !== game.extra.toLowerCase()))) return null;
    let files = directory("/");
    for (const folder of [".local", "share", "scummvm", "saves", ...(namespace ? [namespace] : [])]) {
      files = directory(files[folder]);
    }
    const valid = index.saves.filter(save => {
      if (index.pending?.includes(save.name) || !Number.isInteger(save.slot) || save.slot < 0 || save.slot > 999) return false;
      const file = inode(files[save.name]);
      return file?.type === 0x8000 && file.size > 0 && Number.isFinite(file.modifiedAt)
        && file.size === save.size && file.modifiedAt === save.modifiedAt && Boolean(storage.getItem(file.key));
    }).sort((a, b) => b.modifiedAt - a.modifiedAt || a.slot - b.slot);
    return valid.length ? { ...valid[0], engineId: index.engineId, gameId: index.gameId, extra: index.extra } : null;
  } catch { return null; }
}
