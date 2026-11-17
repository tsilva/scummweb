import assert from "node:assert/strict";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { after } from "node:test";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { ZipWriter, Uint8ArrayWriter, Uint8ArrayReader } from "@zip.js/zip.js";
import { auditArchives, readCloudArchive } from "./audit.mjs";
import { exportBackup, identifySet } from "../../../../app/save-backups/backups.mjs";
import { exportScummvmSaves } from "../../../../app/save-backups/scummvm-transfer.mjs";
import { makeSnapshot } from "../../../../app/dropbox/protocol.mjs";

async function set(slot = "001", contents = "progress") {
  const value = { destination: { key: "catalog:sky", title: "Test game", family: "sky", namespace: "", isolated: true },
    files: [{ path: `SKY-VM.${slot}`, data: new TextEncoder().encode(contents), modifiedAt: 1 },
      { path: "SKY-VM.SAV", data: new TextEncoder().encode("companion index"), modifiedAt: 1 }] };
  return { ...value, hash: await identifySet(value) };
}
const scratch = await mkdtemp(join(tmpdir(), "scummweb-dropbox-audit-"));
after(() => rm(scratch, { recursive: true, force: true }));
async function fixture(t) {
  const root = await mkdtemp(join(scratch, "case-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  return {
    async browser(name, sets) { const path = join(root, name); await writeFile(path, new Uint8Array(await (await exportBackup(sets)).arrayBuffer())); return path; },
    async native(name, sets) { const path = join(root, name); await writeFile(path, new Uint8Array(await (await exportScummvmSaves(sets)).arrayBuffer())); return path; },
    async cloud(name, nodes, entries) {
      const path = join(root, name), writer = new ZipWriter(new Uint8ArrayWriter(), { useWebWorkers: false, level: 0 });
      for (const [index, node] of nodes.entries()) {
        const blob = await exportBackup([node.set], { cloud: { format: node.format, version: node.version,
          profile: node.profile, hash: node.hash, savedAt: node.savedAt, active: node.active, parents: node.parents } });
        await writer.add(entries?.[index] || `${node.id}.zip`, new Uint8ArrayReader(new Uint8Array(await blob.arrayBuffer())));
      }
      await writeFile(path, await writer.close()); return path;
    },
  };
}

test("a recovered save matches cloud bytes while earlier sets remain only in history", async (t) => {
  const f = await fixture(t), old = await set(), current = await set("002", "new progress");
  const parent = await makeSnapshot(old), child = await makeSnapshot(current, [parent.id]);
  const cloud = await f.cloud("after.zip", [parent, child], [`snapshots/${parent.id}.zip`, `snapshots/${child.id}.zip`]);
  const report = await auditArchives({ cloud, browser: await f.browser("current.zip", [current]),
    baselineCloud: await f.cloud("before.zip", [parent]), baselineBrowser: await f.browser("old.zip", [old]) });
  assert.equal(report.ok, true); assert.equal(report.summary.cloudNodes, 2);
  assert.equal(report.browser.length, 1); assert.deepEqual(report.profiles[0].tips, [{ id: child.id, hash: current.hash }]);
  assert.deepEqual(report.nodes[1].files, report.browser[0].files);
});

test("native exports audit current and recovery copies against cloud history without conversion", async (t) => {
  const f = await fixture(t), old = await set(), current = await set("002", "new progress");
  const parent = await makeSnapshot(old), child = await makeSnapshot(current, [parent.id]);
  const report = await auditArchives({ cloud: await f.cloud("saves.zip", [parent, child]),
    browser: await f.native("native.zip", [current, { ...old, id: "recovery-copy" }]),
    baselineBrowser: await f.native("native-before.zip", [old]) });
  assert.equal(report.ok, true); assert.equal(report.summary.browserSets, 2);
  assert.equal(report.summary.baselineBrowserSets, 1);
  assert.deepEqual(report.browser.map(({ hash }) => hash).sort(), [old.hash, current.hash].sort());
  assert.equal(report.nodes[1].savedAt, child.savedAt);
});

test("native edition fingerprints keep the same cloud identity across browser source IDs", async (t) => {
  const f = await fixture(t), value = await set();
  const edition = { ...value, destination: { key: `version-${"a".repeat(64)}`, namespace: `version-${"a".repeat(64)}`,
    fingerprint: "b".repeat(64), title: "Imported edition" } };
  const node = await makeSnapshot(edition);
  const report = await auditArchives({ cloud: await f.cloud("saves.zip", [node]), browser: await f.native("native.zip", [edition]) });
  assert.equal(report.ok, true); assert.equal(report.browser[0].profile, node.profile);
  assert.equal(report.browser[0].destination, `version-${"b".repeat(64)}`);
});

test("lost baseline history and a browser save that never uploaded fail independently", async (t) => {
  const f = await fixture(t), old = await set(), offline = await set("007", "queued offline");
  const parent = await makeSnapshot(old);
  const report = await auditArchives({ cloud: await f.cloud("empty.zip", []), browser: await f.browser("pending.zip", [offline]),
    baselineCloud: await f.cloud("baseline.zip", [parent]), baselineBrowser: await f.browser("original.zip", [old]) });
  assert.equal(report.ok, false);
  assert.deepEqual(report.issues.map(({ kind }) => kind).sort(), ["baseline-node-missing", "baseline-set-missing-from-cloud", "browser-set-missing-from-cloud"]);
});

test("concurrent branches are visible and only permitted at an explicit intermediate checkpoint", async (t) => {
  const f = await fixture(t), first = await makeSnapshot(await set()), second = await makeSnapshot(await set("001", "different progress"));
  const cloud = await f.cloud("branches.zip", [first, second]);
  assert.equal((await auditArchives({ cloud })).ok, false);
  const checkpoint = await auditArchives({ cloud, allowConflicts: true });
  assert.equal(checkpoint.ok, true); assert.deepEqual(checkpoint.concurrent, [first.profile]);
});

test("wrong node filenames, duplicate logical IDs and incomplete ancestry fail even when conflicts are allowed", async (t) => {
  const f = await fixture(t), node = await makeSnapshot(await set());
  const wrong = await f.cloud("wrong.zip", [node], ["a".repeat(64) + ".zip"]);
  await assert.rejects(auditArchives({ cloud: wrong, allowConflicts: true }), /verification|identity|contents/i);
  const duplicate = await f.cloud("duplicate.zip", [node, node], [node.id + ".zip", "wrapper/" + node.id + ".zip"]);
  await assert.rejects(readCloudArchive(duplicate), /Duplicate/);
  const orphan = await makeSnapshot(await set("002"), ["b".repeat(64)]);
  await assert.rejects(readCloudArchive(await f.cloud("orphan.zip", [orphan])), /incomplete/);
});

test("inner manifest and payload mismatches use the production snapshot verifier", async (t) => {
  const f = await fixture(t), original = await set(), node = await makeSnapshot(original);
  const tampered = { ...node, set: await set("001", "changed bytes") };
  await assert.rejects(readCloudArchive(await f.cloud("tampered.zip", [tampered])), /verification/);
});

test("CLI reports failed qualification with a nonzero exit and machine-readable output", async (t) => {
  const f = await fixture(t), browser = await f.browser("pending.zip", [await set()]), cloud = await f.cloud("empty.zip", []);
  const result = spawnSync(process.execPath, [fileURLToPath(new URL("./audit.mjs", import.meta.url)), "--cloud", cloud, "--browser", browser], { encoding: "utf8" });
  assert.equal(result.status, 1); assert.equal(JSON.parse(result.stdout).issues[0].kind, "browser-set-missing-from-cloud");
});
