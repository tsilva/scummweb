import { readFile, stat } from "node:fs/promises";
import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";
import { ZipReader, Uint8ArrayReader, Uint8ArrayWriter } from "@zip.js/zip.js";
import { readSaveImport } from "../../../../app/save-backups/scummvm-transfer.mjs";
import { profileHistory, readNode, saveProfileId } from "../../../../app/dropbox/protocol.mjs";

const MiB = 1024 * 1024;
const limits = { outer: 512 * MiB, snapshot: 64 * MiB, payload: 256 * MiB, entries: 10001 };
const digest = (data) => createHash("sha256").update(data).digest("hex");
const files = (set) => set.files.map((file) => ({ path: file.path, size: file.data.length, sha256: digest(file.data) }));
const identity = (set) => `${set.profile}:${set.hash}`;

async function boundedRead(path, limit) {
  const info = await stat(path);
  if (!info.isFile() || info.size > limit) throw Error("Archive exceeds the audit size limit or is not a regular file.");
  const data = await readFile(path);
  if (data.length > limit) throw Error("Archive changed beyond the audit size limit.");
  return data;
}

export async function readCloudArchive(path) {
  const reader = new ZipReader(new Uint8ArrayReader(await boundedRead(path, limits.outer)), { useWebWorkers: false });
  const nodes = [], seen = new Set();
  let payload = 0, containers = 0;
  try {
    const entries = await reader.getEntries();
    if (entries.length > limits.entries) throw Error("Cloud archive contains too many entries.");
    for (const entry of entries) {
      if (entry.directory) continue;
      // Accept a flat folder ZIP or one Dropbox wrapper directory, never extract it.
      const parts = entry.filename.split("/");
      if (parts.length > 2 || parts.some((part) => !part || part === "." || part === ".." || /[\\\x00-\x1f]/.test(part))
        || !/^[a-f0-9]{64}\.zip$/.test(parts.at(-1)) || entry.encrypted || entry.symlink) {
        throw Error("Unexpected cloud archive entry; select only checksum-named snapshots from the saves folder.");
      }
      const id = parts.at(-1).slice(0, -4);
      if (seen.has(id)) throw Error("Duplicate cloud snapshot ID in archive.");
      seen.add(id);
      if (!Number.isSafeInteger(entry.uncompressedSize) || entry.uncompressedSize < 0 || entry.uncompressedSize > limits.snapshot) {
        throw Error("Cloud snapshot exceeds the audit size limit.");
      }
      containers += entry.uncompressedSize;
      if (containers > limits.outer) throw Error("Unpacked cloud archive exceeds the audit size limit.");
      const bytes = await entry.getData(new Uint8ArrayWriter(), { checkSignature: true,
        onprogress(loaded) { if (loaded > limits.snapshot) throw Error("Cloud snapshot exceeds the audit size limit."); } });
      if (bytes.length !== entry.uncompressedSize) throw Error("Cloud snapshot size mismatch.");
      const node = await readNode({ download: async () => new Blob([bytes]) }, id);
      payload += node.set.files.reduce((sum, file) => sum + file.data.length, 0);
      if (payload > limits.payload) throw Error("Cloud save payload exceeds the supported collection size.");
      // Retain digests rather than every snapshot's save bytes during comparisons.
      nodes.push({ id: node.id, profile: node.profile, hash: node.hash, savedAt: node.savedAt, active: node.active,
        parents: node.parents, files: files(node.set) });
    }
  } finally { await reader.close(); }
  for (const profile of new Set(nodes.map((node) => node.profile))) profileHistory(nodes, profile);
  return nodes;
}

async function readBrowserArchive(path) {
  // Exported native folders retain edition identity without a cloud manifest.
  // The production reader also accepts internal backup ZIPs for recovery audits.
  const sets = await readSaveImport([new Blob([await boundedRead(path, limits.snapshot)])], []);
  return Promise.all(sets.map(async (set) => ({ profile: await saveProfileId(set), hash: set.hash,
    destination: set.destination.key, files: files(set) })));
}

export async function auditArchives({ cloud, browser, baselineCloud, baselineBrowser, allowConflicts = false }) {
  if (!cloud) throw Error("A Dropbox saves-folder ZIP is required.");
  const nodes = await readCloudArchive(cloud);
  const current = browser ? await readBrowserArchive(browser) : [];
  const oldNodes = baselineCloud ? await readCloudArchive(baselineCloud) : [];
  const oldSets = baselineBrowser ? await readBrowserArchive(baselineBrowser) : [];
  const ids = new Set(nodes.map((node) => node.id));
  const contents = new Set(nodes.map(identity));
  const issues = [];
  for (const set of current) if (!contents.has(identity(set))) issues.push({ kind: "browser-set-missing-from-cloud", profile: set.profile, hash: set.hash });
  for (const set of oldSets) if (!contents.has(identity(set))) issues.push({ kind: "baseline-set-missing-from-cloud", profile: set.profile, hash: set.hash });
  for (const node of oldNodes) if (!ids.has(node.id)) issues.push({ kind: "baseline-node-missing", id: node.id });
  const profiles = [...new Set(nodes.map((node) => node.profile))].map((profile) => {
    const history = profileHistory(nodes, profile);
    return { profile, tips: history.tips.map(({ id, hash }) => ({ id, hash })) };
  });
  const concurrent = profiles.filter(({ tips }) => tips.length > 1).map(({ profile }) => profile);
  if (!allowConflicts) for (const profile of concurrent) issues.push({ kind: "concurrent-tips", profile });
  return { schema: 1, ok: issues.length === 0, allowConflicts, summary: { cloudNodes: nodes.length,
    browserSets: current.length, baselineCloudNodes: oldNodes.length, baselineBrowserSets: oldSets.length,
    profiles: profiles.length, concurrentProfiles: concurrent.length }, issues, concurrent, profiles, browser: current, nodes };
}

const usage = "Usage: node audit.mjs --cloud SNAPSHOTS.zip [--browser SAVES.zip] [--baseline-cloud BEFORE.zip] [--baseline-browser BEFORE.zip] [--allow-conflicts]";
function options(args) {
  const result = {}, names = { "--cloud": "cloud", "--browser": "browser",
    "--baseline-cloud": "baselineCloud", "--baseline-browser": "baselineBrowser", "--allow-conflicts": "allowConflicts" };
  for (let index = 0; index < args.length; index++) {
    const key = names[args[index]];
    if (!key || key in result) throw Error(usage);
    if (key === "allowConflicts") result[key] = true;
    else {
      const value = args[++index];
      if (!value || value.startsWith("--")) throw Error(usage);
      result[key] = value;
    }
  }
  if (!result.cloud) throw Error(usage);
  return result;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (process.argv.length === 3 && process.argv[2] === "--help") console.log(usage);
  else try {
    const report = await auditArchives(options(process.argv.slice(2)));
    console.log(JSON.stringify(report, null, 2));
    if (!report.ok) process.exitCode = 1;
  } catch (error) {
    console.log(JSON.stringify({ ok: false, error: error.message }));
    process.exitCode = 1;
  }
}
