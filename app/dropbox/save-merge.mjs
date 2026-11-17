import { identifySet } from "../save-backups/backups.mjs";

// Timestamps describe a copy; only filenames, bytes and ancestry decide a merge.
const same = (a, b) => !a || !b ? a === b
  : a.data.length === b.data.length && a.data.every((byte, index) => byte === b.data[index]);
const info = (file) => file ? { path: file.path, size: file.data.length, modifiedAt: file.modifiedAt } : null;
const index = (set) => new Map(set.files.map((file) => [file.path.toLowerCase(), file]));

export async function mergeSaveSets(sets, bases = []) {
  const copies = sets.map(index), ancestors = bases.map(index);
  const paths = [...new Set([...copies, ...ancestors].flatMap((files) => [...files.keys()]))].sort();
  const files = [], unresolved = [], differences = [];
  let identical = 0;
  for (const path of paths) {
    const versions = copies.map((copy) => copy.get(path));
    if (versions.every((file) => same(file, versions[0]))) {
      if (versions[0]) { files.push(versions[0]); identical++; }
      continue;
    }
    const original = ancestors.map((copy) => copy.get(path));
    const knownBase = original.length > 0 && original.every((file) => same(file, original[0]));
    // Without shared history, absence is not evidence of deletion: take the union.
    const changes = knownBase ? versions.filter((file) => !same(file, original[0])) : versions.filter(Boolean);
    const compatible = (!original.length || knownBase) && changes.every((file) => same(file, changes[0]));
    const name = versions.find(Boolean)?.path || original.find(Boolean).path;
    differences.push({ path: name, conflict: !compatible,
      reason: compatible ? "Combined automatically" : knownBase && versions.some((file) => !file)
        ? "Deleted in one copy, changed in another" : "Different contents",
      versions: versions.map(info) });
    if (compatible) { if (changes[0]) files.push(changes[0]); }
    else unresolved.push(path);
  }
  // Distinct paths may still collide when one copy has a file where another
  // has a folder. Keep each original layout as a choice instead of restoring
  // an impossible union.
  const collisions = new Set();
  for (const copy of copies) {
    const selected = new Set([...files.map(({ path }) => path.toLowerCase()), ...unresolved.filter((path) => copy.has(path))]);
    for (const path of selected) {
      const parts = path.split("/");
      for (let depth = 1; depth < parts.length; depth++) {
        const parent = parts.slice(0, depth).join("/");
        if (selected.has(parent)) { collisions.add(parent); collisions.add(path); }
      }
    }
  }
  for (const path of collisions) {
    const versions = copies.map((copy) => copy.get(path));
    let row = differences.find((row) => row.path.toLowerCase() === path);
    if (!row) {
      row = { path: versions.find(Boolean).path, versions: versions.map(info) };
      differences.push(row);
      if (versions.every((file) => same(file, versions[0]))) identical--;
    }
    row.conflict = true;
    row.reason = "File and folder use the same name";
    if (!unresolved.includes(path)) unresolved.push(path);
  }
  for (let index = files.length - 1; index >= 0; index--) if (collisions.has(files[index].path.toLowerCase())) files.splice(index, 1);
  const candidate = async (copy) => {
    const set = { destination: sets[0].destination,
      files: [...files, ...unresolved.map((path) => copy.get(path)).filter(Boolean)].sort((a, b) => a.path.localeCompare(b.path)) };
    return { ...set, hash: await identifySet(set) };
  };
  const candidates = await Promise.all(copies.map(candidate));
  return { set: unresolved.length ? null : candidates[0], candidates, differences: differences.sort((a, b) => a.path.localeCompare(b.path)), identical };
}

// All maximal common ancestors are retained. A file with ambiguous merge bases
// retains competing versions unless every current branch agrees on its contents.
export function commonSaveAncestors(nodes, tips) {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const ancestors = tips.map((tip) => {
    const found = new Set(), todo = [tip.id];
    while (todo.length) {
      const id = todo.pop();
      if (found.has(id)) continue;
      found.add(id);
      todo.push(...byId.get(id).parents);
    }
    return found;
  });
  const common = nodes.filter(({ id }) => ancestors.every((ids) => ids.has(id)));
  const older = new Set(common.flatMap(({ parents }) => parents));
  return common.filter(({ id }) => !older.has(id)).map(({ set }) => set);
}

// Prefer the latest recorded save time; equal clocks use content identity so
// listing order, device and retries cannot choose different winners.
export async function automaticSaveMerge(sets, bases = []) {
  const ordered = [...sets].sort((a, b) => saveSetTime(b) - saveSetTime(a) || (a.hash < b.hash ? -1 : a.hash > b.hash ? 1 : 0));
  return preferredSaveMerge(ordered, bases);
}

export async function preferredSaveMerge(ordered, bases = []) {
  const merge = await mergeSaveSets(ordered, bases);
  if (merge.set) return { set: merge.set, selected: false };
  // Slot files can coexist, but a changed companion/index or file/folder
  // collision requires a complete coherent copy, not a mixture of layouts.
  const independent = merge.differences.filter(({ conflict }) => conflict)
    .every(({ path, reason }) => /\.(?:s)?[0-9]+$/i.test(path) && reason !== "File and folder use the same name");
  return { set: independent ? merge.candidates[0] : ordered[0], selected: true };
}

export const saveSetTime = (set) => Math.max(0, ...set.files.map(({ modifiedAt }) => Number.isFinite(modifiedAt) ? modifiedAt : 0));
