import { editionKey, readSaveTree } from "../web-shell/save-editions.mjs";

function readGameSaveTree(game, storage, namespace) {
  return readSaveTree(storage, editionKey(namespace, game.target), namespace);
}

// Also serialized for the small pre-paint reader.
// Only indexed, complete files in the selected edition can offer Continue.
export function readCachedSave(game, storage, namespace = "", includeContents = false, readTree = readGameSaveTree) {
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
    const valid = index.saves.filter(save => {
      if (index.pending?.includes(save.name) || !Number.isInteger(save.slot) || save.slot < 0 || save.slot > 999) return false;
      const file = inode(files[save.name]);
      return file?.type === 0x8000 && file.size > 0 && Number.isFinite(file.modifiedAt)
        && file.size === save.size && file.modifiedAt === save.modifiedAt && Boolean(storage.getItem(file.dataKey));
    }).sort((a, b) => b.modifiedAt - a.modifiedAt || a.slot - b.slot);
    const latest = valid[0];
    if (!latest) return null;
    const contents = includeContents ? storage.getItem(inode(files[latest.name]).dataKey) : undefined;
    return { ...latest, engineId: index.engineId, gameId: index.gameId, extra: index.extra,
      ...(includeContents && { contents }) };
  } catch { return null; }
}
