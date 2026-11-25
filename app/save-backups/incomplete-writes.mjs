import { saveIndexPrefix } from "../../web-shell/continue-saves.mjs";

// Read only save-index records. Never inspect authorization or unrelated storage.
export function readIncompleteSaveWrites(storage, destinations = [], sets = []) {
  const result = [];
  const keys = storage.keys?.() || Array.from({ length: storage.length }, (_, index) => storage.key(index));
  for (const key of keys) {
    if (!key?.startsWith(saveIndexPrefix) || key.startsWith(`${saveIndexPrefix}agent-`)) continue;
    let record;
    try { record = JSON.parse(storage.getItem(key)); } catch { continue; }
    if (!Array.isArray(record?.pending) || !record.pending.length) continue;
    const indexedKey = key.slice(saveIndexPrefix.length);
    const destinationKey = destinations.some(item => item.key === record.destinationKey) ? record.destinationKey : indexedKey;
    const destination = destinations.find((item) => item.key === destinationKey);
    const files = sets.filter((set) => set.destination.key === destinationKey).flatMap((set) => set.files);
    result.push({ key, destinationKey, target: record.target || "", engineId: record.engineId || "", gameId: record.gameId || "",
      title: destination?.title || record.target || "Unmatched saved game",
      files: [...new Set(record.pending)].filter((name) => typeof name === "string").map((name) => {
        const file = files.find((item) => item.path === name);
        return { name, exists: Boolean(file), size: file?.data.length ?? null };
      }) });
  }
  return result.sort((a, b) => a.title.localeCompare(b.title));
}
