import { exportBackup, identifySet, readBackup } from "../save-backups/backups.mjs";
import { DropboxError, hex, sha256 } from "./client.mjs";
import { commonSaveAncestors, automaticSaveMerge, saveSetTime } from "./save-merge.mjs";

const hashPattern = /^[a-f0-9]{64}$/;
export async function saveProfileId(set) {
  const identity = set.destination.fingerprint ? `fingerprint:${set.destination.fingerprint}` : set.destination.key;
  return hex(await sha256(new TextEncoder().encode(identity)));
}
export function reconcileSave(base, local, remote) {
  if (local === remote) return "same";
  if (local === null || local === base) return "download";
  if (remote === null || remote === base) return "upload";
  return "conflict";
}
async function nodeId(node) {
  return hex(await sha256(new TextEncoder().encode(JSON.stringify([node.version, node.profile, node.hash, node.savedAt, node.active, [...node.parents].sort()]))));
}
export async function makeSnapshot(set, parents = [], active = true) {
  if (set.hash !== await identifySet(set)) throw new DropboxError("The save changed before it could be copied.", "integrity");
  const node = { format: "scummweb-cloud-snapshot", version: 1, profile: await saveProfileId(set), hash: set.hash, savedAt: saveSetTime(set), active,
    parents: [...new Set(parents)].sort() };
  validateNode(node);
  return { ...node, id: await nodeId(node), set };
}
function validateNode(node) {
  if (node?.format !== "scummweb-cloud-snapshot" || node.version !== 1 || !hashPattern.test(node.profile)
    || !hashPattern.test(node.hash) || typeof node.active !== "boolean" || !Array.isArray(node.parents) || node.parents.length > 10000
    || !node.parents.every((id) => typeof id === "string" && hashPattern.test(id)) || new Set(node.parents).size !== node.parents.length
    || !Number.isFinite(node.savedAt) || node.savedAt < 0
    || !node.active && node.parents.length) throw new DropboxError("Invalid cloud save information. Local saves are unchanged.", "integrity");
}
export async function readNode(client, id) {
  if (!hashPattern.test(id)) throw new DropboxError("Invalid cloud snapshot identity.", "integrity");
  const { sets, manifest } = await readBackup(await client.download(`${id}.zip`), { withManifest: true });
  const node = manifest.cloud;
  validateNode(node);
  if (sets.length !== 1 || sets[0].hash !== node.hash || saveSetTime(sets[0]) !== node.savedAt || await saveProfileId(sets[0]) !== node.profile || await nodeId(node) !== id) {
    throw new DropboxError("Cloud save contents failed verification. Local saves are unchanged.", "integrity");
  }
  client.verified?.(`${id}.zip`, sets[0]);
  return { ...node, id, set: sets[0] };
}
export async function writeSnapshot(client, node) {
  await client.upload(`${node.id}.zip`, await exportBackup([node.set], { cloud: {
    format: node.format, version: node.version, profile: node.profile, hash: node.hash, savedAt: node.savedAt, active: node.active, parents: node.parents,
  } }), { title: node.set.destination.title });
  // Never acknowledge a write based only on its HTTP response. A retry uses the
  // same logical ID; ZIP creation timestamps do not change the save identity.
  return readNode(client, node.id);
}
export function profileHistory(nodes, profile) {
  const own = nodes.filter((node) => node.profile === profile);
  const byId = new Map(own.map((node) => [node.id, node]));
  const superseded = new Set();
  for (const node of own) for (const parent of node.parents) {
    if (!byId.has(parent) || parent === node.id) throw new DropboxError("Cloud history is incomplete. Your copies are retained.", "integrity");
    superseded.add(parent);
  }
  // Reject cycles, even if malicious files would otherwise hide every tip.
  const remaining = new Map(own.map((node) => [node.id, node.parents.length]));
  const children = new Map();
  for (const node of own) for (const parent of node.parents) {
    if (!children.has(parent)) children.set(parent, []);
    children.get(parent).push(node.id);
  }
  const ready = own.filter((node) => !node.parents.length).map((node) => node.id);
  for (let index = 0; index < ready.length; index++) for (const child of children.get(ready[index]) || []) {
    remaining.set(child, remaining.get(child) - 1);
    if (remaining.get(child) === 0) ready.push(child);
  }
  if (ready.length !== own.length) throw new DropboxError("Cloud history is invalid.", "integrity");
  const tips = own.filter((node) => node.active && !superseded.has(node.id)).sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  return { tips, alternatives: own.filter((node) => !node.active), own };
}

// This facade gives the coordinator a three-way merge without provider-specific
// revisions. Concurrent nodes converge automatically while originals remain recoverable.
export async function createSaveCollection(transport, cache) {
  let nodes = [];
  async function refresh() {
    const names = [...new Set(await transport.list())];
    const previousIds = new Set(nodes.map((node) => `${node.id}.zip`));
    const changed = names.length !== previousIds.size || names.some((name) => !previousIds.has(name));
    // Snapshots are immutable and already verified. Reuse this pass's bytes
    // instead of reopening IndexedDB for the entire history after every game.
    // Build the active collection from the fresh listing so deletions still count.
    const verified = new Map(nodes.map((node) => [node.id, node]));
    const next = [];
    let totalBytes = 0;
    for (const name of names) {
      const id = name.slice(0, -4);
      let node = verified.get(id) ?? await cache?.load(id);
      if (!node) { node = await readNode(transport, id); await cache?.save(node); }
      totalBytes += node.set.files.reduce((sum, file) => sum + file.data.length, 0);
      if (totalBytes > 256 * 1024 * 1024) throw new DropboxError("Cloud save history exceeds the supported collection size. Your copies are retained.");
      next.push(node);
    }
    nodes = next;
    return changed;
  }
  await refresh();
  const history = (profile) => profileHistory(nodes, profile);
  const head = (profile) => {
    const { tips, alternatives, own } = history(profile);
    return { active: tips[0]?.hash ?? null, tips: tips.map(({ id }) => id), concurrent: tips.length > 1,
      snapshots: [...new Set(own.map(({ hash }) => hash))],
      alternatives: [...new Set([...alternatives, ...tips.slice(1)].map(({ hash }) => hash))].filter((hash) => hash !== tips[0]?.hash) };
  };
  async function put(set, parents, active, check) {
    const node = await makeSnapshot(set, parents, active);
    if (!nodes.some(({ id }) => id === node.id)) {
      await check();
      const confirmed = await writeSnapshot(transport, node);
      await cache?.save(confirmed);
      nodes.push(confirmed);
      return true;
    }
    return false;
  }
  return {
    close: () => transport.close(),
    refresh,
    profiles: () => [...new Set(nodes.map(({ profile }) => profile))],
    head,
    snapshot(profile, hash) {
      const { tips, own } = history(profile);
      const matches = tips.some((item) => item.hash === hash) ? tips : own;
      const node = matches.filter((item) => item.hash === hash).sort((a, b) => b.savedAt - a.savedAt || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))[0];
      if (!node) throw new DropboxError("Cloud snapshot is missing. Local saves are unchanged.", "integrity");
      return node.set;
    },
    async publish({ profile, local, alternatives = [], base = null, baseTips = [], refreshUnchanged = true, check = () => {} }) {
      const before = head(profile);
      if (base !== null && (!before.snapshots.includes(base) || baseTips.some((id) => !nodes.some((node) => node.id === id)))) {
        throw new DropboxError("Cloud history is missing. Your local copies are retained.", "integrity");
      }
      let wrote = false;
      for (const set of alternatives) if (!before.snapshots.includes(set.hash)) wrote = await put(set, [], false, check) || wrote;
      if (local && local.hash !== base && !history(profile).tips.some((node) => node.hash === local.hash)) {
        wrote = await put(local, baseTips, true, check) || wrote;
      }
      // Re-list after publication to observe another device's concurrent commit.
      // A coordinator can batch unchanged profiles, then refresh the complete
      // collection before declaring it ready. Actual writes always re-list.
      if (wrote || refreshUnchanged) await refresh();
      let after = head(profile);
      let merged = false;
      for (let attempt = 0; after.concurrent; attempt++) {
        if (attempt === 4) throw new DropboxError("Saves are still changing on another device. They will be checked again shortly.");
        const { tips, own } = history(profile);
        const merge = await automaticSaveMerge(tips.map(({ set }) => set), commonSaveAncestors(own, tips));
        // Publish explicit recovery copies before acknowledging any automatic
        // selection. Originals and every ancestry edge remain immutable.
        if (merge.selected) for (const { set } of tips) await put(set, [], false, check);
        await put(merge.set, after.tips, true, check);
        await refresh(); // Include arrivals during publication before restoring.
        after = head(profile);
        merged = true;
      }
      const reconciled = reconcileSave(base, local?.hash ?? null, after.active);
      // A retry without its local baseline can present an already incorporated
      // parent again. Its immutable publication is now an ancestor, not a fork.
      const action = merged || reconciled === "conflict" ? "download" : reconciled;
      return { action, head: after };
    },
  };
}
export async function readSnapshot(collection, profile, hash) { return collection.snapshot(profile, hash); }
export async function readHead(collection, profile) { return { head: collection.head(profile) }; }
export async function publishProfile({ client, ...args }) { return client.publish(args); }
