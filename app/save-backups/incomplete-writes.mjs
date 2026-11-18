import { saveIndexPrefix } from "../../web-shell/continue-saves.mjs";

// Read only save-index records. Never inspect authorization or unrelated storage.
export function readIncompleteSaveWrites(storage, destinations = [], sets = []) {
  const result = [];
  for (let i = 0; i < storage.length; i++) {
    const key = storage.key(i);
    if (!key?.startsWith(saveIndexPrefix) || key.startsWith(`${saveIndexPrefix}agent-`)) continue;
    let record;
    try { record = JSON.parse(storage.getItem(key)); } catch { continue; }
    if (!Array.isArray(record?.pending) || !record.pending.length) continue;
    const destinationKey = key.slice(saveIndexPrefix.length);
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

// Backyard Baseball opens a script-owned records stream through the same native
// save manager as numbered slots. Keep an abandoned empty stream local until the
// game closes a new write successfully. Never infer this from a filename alone.
export function isEmptyBaseballRecordsWrite(entry) {
  return entry.engineId === "scumm" && entry.gameId === "baseball" && entry.target === "baseball"
    && entry.files.length === 1 && entry.files[0].name === "baseball-records.bbl" && entry.files[0].size === 0;
}
