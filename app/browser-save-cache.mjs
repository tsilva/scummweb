import { editionKey, readSaveTree } from "../web-shell/save-editions.mjs";
import { parseAutosave } from "../web-shell/rotating-autosaves.mjs";

function readGameSaveTree(game, storage, namespace) {
  return readSaveTree(storage, editionKey(namespace, game.target), namespace);
}

// Also serialized for the small pre-paint reader.
// Only indexed, complete files in the selected edition can offer Continue.
export function readCachedSave(game, storage, namespace = "", {
  includeContents = false, readTree = readGameSaveTree, autosavesOnly = false,
} = {}) {
  try {
    if (namespace === null) return null;
    const index = JSON.parse(storage.getItem("scummweb.continue.v1:" + (namespace || `catalog:${game.target}`)));
    if (index?.schemaVersion !== 1 || !index.supported || !Array.isArray(index.saves)
      || (index.pending != null && !Array.isArray(index.pending))) return null;
    if (!namespace && (index.target !== (game.nativeTarget || game.target)
      || (game.engineId && index.engineId !== game.engineId)
      || (game.gameId && index.gameId !== game.gameId)
      || (game.extra && index.extra?.toLowerCase() !== game.extra.toLowerCase()))) return null;
    const { files, inode } = readTree(game, storage, namespace);
    let checkpoint;
    for (let slot = 0; slot < 3; slot++) {
      const name = `.scummweb-autosave.${slot}`;
      if (index.pending?.includes(name)) continue;
      const file = inode(files[name]);
      if (file?.type !== 0x8000 || file.size <= 0 || file.size > 3 * 1024 * 1024) continue;
      try {
        const bytes = storage.getBytes ? storage.getBytes(file.dataKey)
          : Uint8Array.from(atob(storage.getItem(file.dataKey) || ""), char => char.charCodeAt(0));
        const candidate = parseAutosave(new TextDecoder().decode(bytes));
        if (candidate && candidate.target === index.target && candidate.engineId === index.engineId
          && candidate.gameId === index.gameId && candidate.extra === (index.extra || "")
          && (!checkpoint || candidate.savedAt > checkpoint.savedAt)) checkpoint = candidate;
      } catch { /* Try the next intact checkpoint. */ }
    }
    const latest = autosavesOnly ? null : index.saves.filter(save => {
      if (index.pending?.includes(save.name) || !Number.isInteger(save.slot) || save.slot < 0 || save.slot > 999) return false;
      const file = inode(files[save.name]);
      return file?.type === 0x8000 && file.size > 0 && Number.isFinite(file.modifiedAt)
        && file.size === save.size && file.modifiedAt === save.modifiedAt
        && Boolean(storage.getBytes ? storage.getBytes(file.dataKey)?.length : storage.getItem(file.dataKey));
    }).sort((a, b) => b.modifiedAt - a.modifiedAt || a.slot - b.slot)[0];
    if (checkpoint && (!latest || checkpoint.savedAt > latest.modifiedAt)) {
      const suffix = checkpoint.engineId === "queen"
        ? ".s" + String(checkpoint.slot).padStart(2, "0")
        : "." + String(checkpoint.slot).padStart(3, "0");
      const contents = includeContents ? checkpoint.files.find(({ name }) => name.endsWith(suffix))?.contents : undefined;
      return { slot: checkpoint.slot, modifiedAt: checkpoint.savedAt, engineId: checkpoint.engineId,
        gameId: checkpoint.gameId, extra: checkpoint.extra, autosave: true, progress: checkpoint.progress, contents };
    }
    if (!latest) return null;
    const contents = includeContents ? storage.getItem(inode(files[latest.name]).dataKey) : undefined;
    return { ...latest, engineId: index.engineId, gameId: index.gameId, extra: index.extra,
      ...(includeContents && { contents }) };
  } catch { return null; }
}
