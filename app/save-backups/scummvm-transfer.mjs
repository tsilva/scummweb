import { identifySet, readBackup } from "./backups.mjs";
import { safePath } from "./filesystem.mjs";
import { editionKey, matchesLegacySave } from "../../web-shell/save-editions.mjs";

const maxBytes = 64 * 1024 * 1024, maxFiles = 4096;
const ignored = /^(?:timestamps|scummvm\.ini|desktop\.ini|thumbs\.db|\.ds_store)$/i;
const slug = (title) => title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "game";
const identity = (destination) => destination.fingerprint ? `edition-${destination.fingerprint}` : destination.key.replace(":", "-");

// The ZIP is only a container. Every save keeps its native name and bytes;
// separate game/copy folders prevent editions and recovery copies colliding.
export async function exportScummvmSaves(sets) {
  const unique = new Map();
  for (const set of sets) {
    const key = `${identity(set.destination)}:${set.hash}`;
    if (set.files.length && (!unique.has(key) || !set.id)) unique.set(key, set);
  }
  sets = [...unique.values()];
  const files = sets.flatMap(({ files }) => files);
  if (!files.length) throw new Error("There are no saved games to export yet.");
  if (sets.length > 1000 || files.length > maxFiles || files.reduce((total, { data }) => total + data.length, 0) > maxBytes - 1024 * 1024) {
    throw new Error("This collection exceeds the 64 MiB save limit.");
  }
  const { ZipWriter, BlobWriter, Uint8ArrayReader } = await import("@zip.js/zip.js");
  const writer = new ZipWriter(new BlobWriter("application/zip"), { useWebWorkers: false, level: 0 });
  const entries = new Set(), current = new Set();
  for (const set of sets) {
    const game = identity(set.destination);
    const recovery = set.id || current.has(game);
    const folder = `${slug(set.destination.title)}--${game}/${recovery ? `recovery-${set.hash}` : "current"}`;
    if (!recovery) current.add(game);
    for (const file of set.files) {
      const path = `${folder}/${file.path}`;
      if (!safePath(path) || entries.has(path.toLowerCase())) throw new Error("Save filenames overlap. Export each game separately.");
      entries.add(path.toLowerCase());
      const date = new Date(file.modifiedAt);
      await writer.add(path, new Uint8ArrayReader(file.data), {
        ...(Number.isFinite(date.getTime()) && date.getUTCFullYear() >= 1980 && date.getUTCFullYear() <= 2107 && { lastModDate: date }),
      });
    }
  }
  return writer.close();
}

function exportedDestination(folder, destinations) {
  const match = /^(.*)--(catalog-[a-z0-9-]+|version-[a-f0-9]{64}|edition-[a-f0-9]{64}|shared)$/.exec(folder);
  if (!match) return null;
  const [, title, id] = match;
  const destination = destinations.find((item) => identity(item) === id);
  if (destination) return { ...destination, ...(!destination.namespace && destination.key !== "shared" && { isolated: true }) };
  if (id.startsWith("catalog-")) {
    const family = id.slice(8);
    if (!editionKey("", family)) throw new Error("Unknown game edition in exported saves.");
    return { key: `catalog:${family}`, family, namespace: "", title, isolated: true };
  }
  if (id === "shared") return { key: "shared", family: "shared", namespace: "", title };
  const namespace = `version-${id.slice(id.indexOf("-") + 1)}`;
  return { key: namespace, namespace, title, ...(id.startsWith("edition-") && { fingerprint: id.slice(8) }) };
}

// Accept either a selection of ordinary saves or a ZIP. An explicit game is
// needed only when filenames cannot identify an edition safely.
export async function readSaveImport(inputs, destinations, destinationKey = "") {
  const choice = destinations.find(({ key }) => key === destinationKey);
  const selected = choice && { ...choice, ...(!choice.namespace && choice.key !== "shared" && { isolated: true }) };
  const files = [], names = new Set();
  let total = 0, entriesSeen = 0;
  async function add(path, data, modifiedAt) {
    if (!safePath(path) || names.has(path.toLowerCase())) throw new Error("Invalid or duplicate save filename.");
    names.add(path.toLowerCase());
    if (ignored.test(path.split("/").at(-1)) || path.split("/").some((part) => part === "__MACOSX")) return;
    if (files.length >= maxFiles || !data.length || (total += data.length) > maxBytes - 1024 * 1024) {
      throw new Error("Choose nonempty save files totaling less than 63 MiB.");
    }
    files.push({ path, data, modifiedAt: Number.isFinite(modifiedAt) && modifiedAt >= 0 ? modifiedAt : 0 });
  }
  inputs = Array.from(inputs);
  if (!inputs.length || inputs.length > maxFiles || inputs.reduce((sum, file) => sum + file.size, 0) > maxBytes) {
    throw new Error("Choose save files or a ZIP totaling 64 MiB or less.");
  }
  for (const input of inputs) {
    const signature = new Uint8Array(await input.slice(0, 4).arrayBuffer());
    if (signature[0] === 0x50 && signature[1] === 0x4b && signature[2] === 3 && signature[3] === 4) {
      const { ZipReader, BlobReader, Uint8ArrayWriter } = await import("@zip.js/zip.js");
      const reader = new ZipReader(new BlobReader(input), { useWebWorkers: false });
      try {
        const entries = [];
        let expanded = 0;
        for await (const entry of reader.getEntriesGenerator()) {
          if (++entriesSeen > maxFiles + 1000 || entry.encrypted || entry.symlink || !safePath(entry.filename.replace(/\/$/, ""))) {
            throw new Error("This ZIP contains unsupported entries.");
          }
          expanded += entry.uncompressedSize;
          if (!Number.isSafeInteger(expanded) || expanded > maxBytes) throw new Error("This ZIP exceeds 64 MiB when unpacked.");
          if (!entry.directory) entries.push(entry);
        }
        // Cloud archives remain usable for deliberate recovery. Desktop exports
        // use native filenames and require no application manifest.
        if (entries.some(({ filename }) => filename === "manifest.json")) {
          if (inputs.length !== 1) throw new Error("Import a ScummWEB backup separately from other save files.");
          return readBackup(input);
        }
        for (const entry of entries) {
          const data = await entry.getData(new Uint8ArrayWriter(), { checkSignature: true,
            onprogress: (loaded) => { if (loaded > maxBytes) throw new Error("Save file is too large."); } });
          if (data.length !== entry.uncompressedSize) throw new Error("A save file has an invalid size.");
          await add(entry.filename, data, entry.lastModDate?.getTime() || 0);
        }
      } finally { await reader.close(); }
    } else {
      await add(input.name, new Uint8Array(await input.arrayBuffer()), input.lastModified || 0);
    }
  }
  if (!files.length) throw new Error("No save files were found.");
  const groups = new Map();
  for (const file of files) {
    const parts = file.path.split("/");
    const exported = parts.length >= 3 && /^(?:current|recovery-[a-f0-9]{64})$/.test(parts[1])
      ? exportedDestination(parts[0], destinations) : null;
    const basename = parts.at(-1);
    const matches = destinations.filter((item) => item.key.startsWith("catalog:") && matchesLegacySave(item.family, basename));
    const destination = exported || selected || (matches.length === 1 ? { ...matches[0], isolated: true } : null);
    if (!destination) {
      const error = new Error("Choose the game these saves belong to.");
      error.kind = "choose-game";
      throw error;
    }
    const directory = parts.slice(0, -1).join("/");
    const groupKey = `${destination.key}:${exported ? parts.slice(0, 2).join("/") : directory}`;
    if (!groups.has(groupKey)) groups.set(groupKey, { destination, files: [], recovery: Boolean(exported && parts[1].startsWith("recovery-")) });
    groups.get(groupKey).files.push({ ...file, path: exported ? parts.slice(2).join("/") : basename });
  }
  const sets = [];
  for (const { recovery, ...set } of groups.values()) {
    const paths = new Set();
    for (const { path } of set.files) {
      if (paths.has(path.toLowerCase())) throw new Error("Duplicate save filename for the same game.");
      paths.add(path.toLowerCase());
    }
    for (const path of paths) {
      const parts = path.split("/");
      if (parts.slice(0, -1).some((_, index) => paths.has(parts.slice(0, index + 1).join("/")))) {
        throw new Error("A save filename overlaps a folder.");
      }
    }
    if (set.destination.family === "sky" && !paths.has("sky-vm.sav")) throw new Error("Include SKY-VM.SAV together with the Beneath a Steel Sky save slots.");
    sets.push({ ...set, hash: await identifySet(set), ...(recovery && { recovery: true }) });
  }
  return sets.sort((a, b) => Number(Boolean(a.recovery)) - Number(Boolean(b.recovery)));
}
