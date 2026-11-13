import { exportBackup, identifySet, readBackup } from "../save-backups/backups.mjs";
import { DropboxError, hex, sha256 } from "./client.mjs";

const hashPattern = /^[a-f0-9]{64}$/;
const root = "/Saves/v1/";
export async function saveProfileId(set) {
  const identity = set.destination.fingerprint ? `fingerprint:${set.destination.fingerprint}` : set.destination.key;
  return hex(await sha256(new TextEncoder().encode(identity)));
}
export function profilePath(profile) {
  if (!hashPattern.test(profile)) throw new DropboxError("Invalid cloud save identity.");
  return root + profile;
}
export function validateHead(value, profile) {
  if (value?.format !== "scummweb-dropbox-saves" || value.version !== 1 || value.profile !== profile
    || !Array.isArray(value.snapshots) || value.snapshots.length > 2048
    || !value.snapshots.every((hash) => typeof hash === "string" && hashPattern.test(hash))
    || new Set(value.snapshots).size !== value.snapshots.length
    || !Array.isArray(value.alternatives) || !value.alternatives.every((hash) => value.snapshots.includes(hash))
    || value.active !== null && !value.snapshots.includes(value.active)) {
    throw new DropboxError("Dropbox save information is invalid. Your local saves are unchanged.", "integrity");
  }
  return value;
}
export function reconcileSave(base, local, remote) {
  if (local === remote) return "same";
  if (local === null || local === base) return "download";
  if (remote === null || remote === base) return "upload";
  return "conflict";
}

export async function readHead(client, profile) {
  const path = profilePath(profile) + "/head.json";
  try {
    const { blob, metadata } = await client.read(path, 512 * 1024);
    let value;
    try { value = JSON.parse(await blob.text()); } catch { throw new DropboxError("Dropbox save information is unreadable.", "integrity"); }
    return { head: validateHead(value, profile), rev: metadata.rev };
  } catch (error) {
    if (error.kind !== "missing") throw error;
    return { head: { format: "scummweb-dropbox-saves", version: 1, profile, active: null, snapshots: [], alternatives: [] }, rev: null };
  }
}

export async function readSnapshot(client, profile, hash) {
  if (!hashPattern.test(hash)) throw new DropboxError("Invalid Dropbox save snapshot.");
  const { blob } = await client.read(`${profilePath(profile)}/${hash}.zip`);
  const sets = await readBackup(blob);
  if (sets.length !== 1 || sets[0].hash !== hash || await saveProfileId(sets[0]) !== profile) {
    throw new DropboxError("Dropbox save contents do not match their game or checksum.", "integrity");
  }
  return sets[0];
}

async function uploadSnapshot(client, profile, set) {
  if (set.hash !== await identifySet(set) || await saveProfileId(set) !== profile) {
    throw new DropboxError("The local save changed before it could be copied.", "integrity");
  }
  const blob = await exportBackup([set]);
  try { await client.upload(`${profilePath(profile)}/${set.hash}.zip`, blob); }
  catch (error) {
    if (error.kind !== "conflict") throw error;
    // A retry may find a committed ZIP with another creation timestamp.
    await readSnapshot(client, profile, set.hash);
  }
}

// Save immutable data first; head publication uses the exact downloaded rev.
// A competing device can only produce a retry/conflict, never a blind overwrite.
export async function publishProfile({ client, profile, local = null, alternatives = [], base = null,
  resolve = false, expectedRemote, check = () => {} }) {
  const copies = [...new Map([...(local ? [local] : []), ...alternatives].map((set) => [set.hash, set])).values()];
  for (const copy of copies) { await check(); await uploadSnapshot(client, profile, copy); }
  for (let attempt = 0; attempt < 4; attempt++) {
    await check();
    const { head, rev } = await readHead(client, profile);
    if (resolve && head.active !== expectedRemote) throw new DropboxError("Saves changed while you were choosing. Review them again.", "conflict");
    // An established cloud head disappearing must not resurrect stale progress.
    if (!rev && base !== null) throw new DropboxError("Dropbox save information is missing. Reconnect or restore a backup before syncing.", "integrity");
    const action = resolve ? "upload" : reconcileSave(base, local?.hash ?? null, head.active);
    const snapshots = [...new Set([...head.snapshots, ...copies.map(({ hash }) => hash)])];
    if (snapshots.length > 2048) throw new DropboxError("This game's Dropbox history is full. Export a backup before managing its history.");
    const active = action === "upload" ? local?.hash ?? head.active : head.active;
    let preserved = [...new Set([...head.alternatives, ...alternatives.map(({ hash }) => hash)])];
    if (action === "conflict") preserved.push(local.hash);
    if (resolve && head.active) preserved.push(head.active);
    preserved = [...new Set(preserved)].filter((hash) => hash !== active);
    const next = { ...head, active, snapshots, alternatives: preserved };
    try {
      if (JSON.stringify(next) !== JSON.stringify(head)) {
        await check();
        await client.upload(profilePath(profile) + "/head.json", new Blob([JSON.stringify(next)]), rev);
        // Read back publication. A lost response is reconciled by the same path.
        const confirmed = await readHead(client, profile);
        if (confirmed.head.active !== active || !copies.every(({ hash }) => confirmed.head.snapshots.includes(hash))) continue;
      }
      return { action, head: next };
    } catch (error) { if (error.kind !== "conflict") throw error; }
  }
  throw new DropboxError("Another device is updating these saves. Your copy is retained; try again shortly.", "conflict");
}
