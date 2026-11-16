import { identifySet } from "../save-backups/backups.mjs";
import { matchesLegacySave } from "../../web-shell/save-editions.mjs";
import { DropboxError, maxBackupBytes } from "./client.mjs";

export const importFilename = /^[a-z0-9][a-z0-9 _().-]{0,119}$/i;
const ignored = /^(?:timestamps|scummvm\.ini|desktop\.ini|thumbs\.db|\.ds_store)$/i;

// A copied directory is an inbox, never a second writable save authority.
// Content identities in cloud history make imports idempotent across browser resets.
export function importListingIdentity(entries, destinations) {
  if (entries.some((entry) => !entry || typeof entry.name !== "string" || entry.directory || typeof entry.revision !== "string" || !entry.revision)) return null;
  return JSON.stringify([entries.map(({ name, size, revision }) => [name, size, revision]).sort(([a], [b]) => a.localeCompare(b)),
    destinations.map(({ key, family }) => [key, family]).sort(([a], [b]) => a.localeCompare(b))]);
}

export async function discoverLooseSaves(transport, destinations, entries = null) {
  entries ??= await transport.listImports();
  if (entries.length > 4096) throw new DropboxError("The Dropbox saves folder contains too many files.");
  const groups = new Map(), names = new Set();
  const issues = [];
  let total = 0;
  for (const entry of entries) {
    if (!entry || typeof entry.name !== "string") throw new DropboxError("Could not read copied Dropbox filenames.", "integrity");
    if (ignored.test(entry.name)) continue;
    if (entry.directory) { issues.push("Copy save files directly into the Dropbox saves folder, without subfolders."); continue; }
    if (!importFilename.test(entry.name) || names.has(entry.name.toLowerCase())) {
      throw new DropboxError("The Dropbox saves folder contains invalid or duplicate filenames.", "integrity");
    }
    names.add(entry.name.toLowerCase());
    if (!Number.isSafeInteger(entry.size) || entry.size < 1 || (total += entry.size) > maxBackupBytes - 1024 * 1024) {
      throw new DropboxError("Copied Dropbox saves must total less than 63 MiB and contain no empty files.");
    }
    const matches = destinations.filter((destination) => destination.key.startsWith("catalog:")
      && matchesLegacySave(destination.family, entry.name));
    if (matches.length !== 1) { issues.push("Some copied saves could not be matched to a library game. Keep their original ScummVM filenames."); continue; }
    const destination = { ...matches[0], isolated: true };
    const blob = await transport.downloadImport(entry.name, { title: destination.title, size: entry.size });
    if (blob.size !== entry.size) throw new DropboxError("Copied saves changed during import. They will be checked again shortly.");
    if (!groups.has(destination.key)) groups.set(destination.key, { destination, files: [] });
    groups.get(destination.key).files.push({ path: entry.name, data: new Uint8Array(await blob.arrayBuffer()),
      modifiedAt: Number.isFinite(entry.modifiedAt) ? entry.modifiedAt : 0 });
  }
  const sets = [];
  for (const set of groups.values()) {
    if (set.destination.family === "sky" && !set.files.some(({ path }) => /^sky-vm\.sav$/i.test(path))) {
      issues.push("Copy SKY-VM.SAV together with the Beneath a Steel Sky save slots."); continue;
    }
    sets.push({ ...set, hash: await identifySet(set) });
  }
  return { sets, message: [...new Set(issues)].join(" ") };
}
