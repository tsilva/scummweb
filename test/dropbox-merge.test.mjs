import assert from "node:assert/strict";
import test from "node:test";
import { identifySet, readBackup } from "../app/save-backups/backups.mjs";
import { commonSaveAncestors, mergeSaveSets } from "../app/dropbox/save-merge.mjs";
import { createSaveCollection, makeSnapshot, publishProfile, saveProfileId, writeSnapshot } from "../app/dropbox/protocol.mjs";
import { fakeNativeStorage } from "./helpers/dropbox-fixtures.mjs";

const destination = { key: "catalog:sky", family: "sky", namespace: "", title: "Beneath a Steel Sky", isolated: true };
const bytes = (text) => new TextEncoder().encode(text);
async function save(contents, modifiedAt = 100) {
  const set = { destination, files: Object.entries(contents).map(([path, text]) => ({ path, data: bytes(text), modifiedAt })) };
  return { ...set, hash: await identifySet(set) };
}
const contents = (set) => Object.fromEntries(set.files.map(({ path, data }) => [path, new TextDecoder().decode(data)]));
async function publish(server, local, options = {}) {
  const client = await createSaveCollection(server), profile = await saveProfileId(local);
  return publishProfile({ client, profile, local, ...options });
}

test("first sync combines a superset and disjoint slots without requiring a baseline", async () => {
  for (const extra of [{ "SKY-VM.001": "one", "SKY-VM.002": "two" }, { "SKY-VM.002": "two" }]) {
    const server = fakeNativeStorage(), local = await save({ "SKY-VM.001": "one" }), remote = await save(extra);
    await publish(server, remote);
    const result = await publish(server, local);
    assert.equal(result.action, "download"); assert.equal(result.head.concurrent, false);
    const client = await createSaveCollection(server);
    assert.deepEqual(contents(client.snapshot(await saveProfileId(local), result.head.active)), { "SKY-VM.001": "one", "SKY-VM.002": "two" });
    assert.ok(client.head(await saveProfileId(local)).snapshots.includes(local.hash));
    assert.ok(client.head(await saveProfileId(local)).snapshots.includes(remote.hash));
  }
});

test("concurrent edits to different existing files use their common ancestor", async () => {
  const server = fakeNativeStorage(), base = await save({ "SKY-VM.001": "one", "SKY-VM.002": "two" });
  const first = await publish(server, base), ancestry = { base: base.hash, baseTips: first.head.tips };
  const left = await save({ "SKY-VM.001": "changed one", "SKY-VM.002": "two" });
  const right = await save({ "SKY-VM.001": "one", "SKY-VM.002": "changed two" });
  await publish(server, left, ancestry);
  const result = await publish(server, right, ancestry), client = await createSaveCollection(server);
  assert.equal(result.action, "download");
  assert.deepEqual(contents(client.snapshot(await saveProfileId(base), result.head.active)), { "SKY-VM.001": "changed one", "SKY-VM.002": "changed two" });
});

test("deletion of an unchanged file combines with edits elsewhere; deletion versus edit conflicts", async () => {
  const base = await save({ "SKY-VM.001": "one", "SKY-VM.002": "two" });
  const deleted = await save({ "SKY-VM.002": "two" });
  const edited = await save({ "SKY-VM.001": "one", "SKY-VM.002": "new two" });
  assert.deepEqual(contents((await mergeSaveSets([deleted, edited], [base])).set), { "SKY-VM.002": "new two" });
  const conflict = await mergeSaveSets([deleted, await save({ "SKY-VM.001": "new one", "SKY-VM.002": "two" })], [base]);
  assert.equal(conflict.set, null);
  assert.match(conflict.differences[0].reason, /Deleted.*changed/);
  assert.equal(conflict.differences[0].versions[0], null);
});

test("same-size same-date bytes conflict and resolution candidates retain every compatible file", async () => {
  const local = await save({ "SKY-VM.001": "left", "SKY-VM.002": "local only", "SKY-VM.SAV": "companion" });
  const remote = await save({ "SKY-VM.001": "away", "SKY-VM.003": "remote only", "SKY-VM.SAV": "companion" });
  const result = await mergeSaveSets([local, remote]);
  assert.equal(result.set, null); assert.equal(result.identical, 1);
  assert.deepEqual(result.differences.filter(({ conflict }) => conflict).map(({ path }) => path), ["SKY-VM.001"]);
  assert.equal(result.differences[0].versions[0].size, result.differences[0].versions[1].size);
  for (const [index, candidate] of result.candidates.entries()) {
    assert.deepEqual(contents(candidate), { "SKY-VM.001": index ? "away" : "left", "SKY-VM.002": "local only", "SKY-VM.003": "remote only", "SKY-VM.SAV": "companion" });
  }
});

test("identical bytes ignore timestamps, file order and filename case without duplicate slots", async () => {
  const local = await save({ "SKY-VM.001": "one", "SKY-VM.002": "two" });
  const remote = await save({ "sky-vm.002": "two", "sky-vm.001": "one" }, 900);
  const result = await mergeSaveSets([local, remote]);
  assert.equal(result.set.files.length, 2); assert.equal(result.differences.length, 0);
  assert.equal(result.identical, 2);
});

test("a file versus folder collision requires a choice instead of creating an invalid union", async () => {
  const local = await save({ "slot": "flat save" }), remote = await save({ "slot/data": "nested save" });
  const result = await mergeSaveSets([local, remote]);
  assert.equal(result.set, null);
  assert.ok(result.differences.every(({ conflict, reason }) => conflict && /File and folder/.test(reason)));
  assert.deepEqual(result.candidates.map(contents), [contents(local), contents(remote)]);
});

test("all concurrent tips participate in a merge, including a new arrival during publication", async () => {
  const server = fakeNativeStorage();
  for (let slot = 1; slot <= 3; slot++) await writeSnapshot(server, await makeSnapshot(await save({ [`SKY-VM.00${slot}`]: String(slot) })));
  const late = await makeSnapshot(await save({ "SKY-VM.004": "4" }));
  server.onUpload = () => { server.onUpload = null; void writeSnapshot(server, late); };
  const local = await save({ "SKY-VM.001": "1" }), result = await publish(server, local);
  assert.equal(result.head.concurrent, false);
  const client = await createSaveCollection(server);
  assert.equal(client.snapshot(await saveProfileId(local), result.head.active).files.length, 4);
});

test("three conflicting branches expose every choice and keep compatible slots in all candidates", async () => {
  const server = fakeNativeStorage();
  const sets = await Promise.all([1, 2, 3].map((slot) => save({ "SKY-VM.001": `variant ${slot}`, [`SKY-VM.00${slot + 1}`]: String(slot) })));
  for (const set of sets) await writeSnapshot(server, await makeSnapshot(set));
  const result = await publish(server, sets[0]);
  assert.equal(result.action, "conflict"); assert.equal(result.conflictSets.length, 3);
  assert.equal(result.conflictMerge.differences.filter(({ conflict }) => conflict).length, 1);
  assert.ok(result.conflictMerge.candidates.every(({ files }) => files.length === 4));
});

test("duplicate branch contents offer one choice while retaining all ancestry tips", async () => {
  const server = fakeNativeStorage(), a = await save({ "SKY-VM.001": "a" }), b = await save({ "SKY-VM.001": "b" });
  const base = await makeSnapshot(await save({ "SKY-VM.001": "base" }));
  await writeSnapshot(server, base);
  await writeSnapshot(server, await makeSnapshot(a, [base.id]));
  await writeSnapshot(server, await makeSnapshot(a));
  await writeSnapshot(server, await makeSnapshot(b));
  const result = await publish(server, a);
  assert.equal(result.action, "conflict"); assert.equal(result.head.tips.length, 3);
  assert.equal(result.conflictSets.length, 2);
  assert.notEqual(result.conflictSets[0].hash, result.conflictSets[1].hash);
  assert.equal(result.conflictSets[1].hash, result.head.active);
});

test("a lost auto-merge reply retries the same immutable result", async () => {
  const server = fakeNativeStorage(), local = await save({ "SKY-VM.001": "one" }), remote = await save({ "SKY-VM.002": "two" });
  await publish(server, remote);
  await writeSnapshot(server, await makeSnapshot(local));
  server.onUpload = () => { server.onUpload = null; server.failAfterUpload = true; };
  await assert.rejects(publish(server, local));
  const result = await publish(server, local);
  assert.equal(result.head.concurrent, false);
  const count = server.files.size;
  const retried = await publish(server, local);
  assert.equal(retried.action, "download");
  assert.equal(server.files.size, count);
});

test("compatible deletions may produce a verified empty cloud snapshot", async () => {
  const server = fakeNativeStorage(), base = await save({ "SKY-VM.001": "one", "SKY-VM.002": "two" });
  const initial = await publish(server, base), ancestry = { base: base.hash, baseTips: initial.head.tips };
  await publish(server, await save({ "SKY-VM.001": "one" }), ancestry);
  const result = await publish(server, await save({ "SKY-VM.002": "two" }), ancestry);
  const client = await createSaveCollection(server), empty = client.snapshot(await saveProfileId(base), result.head.active);
  assert.equal(empty.files.length, 0);
  const node = await makeSnapshot(empty, result.head.tips);
  await writeSnapshot(server, node);
  assert.equal((await readBackup(server.files.get(`${node.id}.zip`)))[0].files.length, 0);
});

test("ambiguous common ancestors do not guess between overwritten contents", async () => {
  const a = { id: "a", parents: [], set: await save({ "SKY-VM.001": "one" }) };
  const b = { id: "b", parents: [], set: await save({ "SKY-VM.001": "two" }) };
  const c = { id: "c", parents: ["a", "b"], set: a.set };
  const d = { id: "d", parents: ["a", "b"], set: b.set };
  const bases = commonSaveAncestors([a, b, c, d], [c, d]);
  assert.deepEqual(bases, [a.set, b.set]);
  assert.equal((await mergeSaveSets([c.set, d.set], bases)).set, null);
});
