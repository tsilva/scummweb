import assert from "node:assert/strict";
import test from "node:test";
import { identifySet, readBackup } from "../app/save-backups/backups.mjs";
import { commonSaveAncestorNodes, mergeSaveSets, automaticSaveMerge, preferredSaveMerge } from "../app/dropbox/save-merge.mjs";
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
    assert.deepEqual(contents(await client.snapshot(await saveProfileId(local), result.head.active)), { "SKY-VM.001": "one", "SKY-VM.002": "two" });
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
  assert.deepEqual(contents(await client.snapshot(await saveProfileId(base), result.head.active)), { "SKY-VM.001": "changed one", "SKY-VM.002": "changed two" });
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
  assert.equal((await client.snapshot(await saveProfileId(local), result.head.active)).files.length, 4);
});

test("three overlapping branches converge automatically and retain every original for recovery", async () => {
  const server = fakeNativeStorage();
  const sets = await Promise.all([1, 2, 3].map((slot) => save({ "SKY-VM.001": `variant ${slot}`, [`SKY-VM.00${slot + 1}`]: String(slot) }, slot * 100)));
  for (const set of sets) await writeSnapshot(server, await makeSnapshot(set));
  const result = await publish(server, sets[0]);
  assert.equal(result.action, "download"); assert.equal(result.head.concurrent, false);
  const client = await createSaveCollection(server), profile = await saveProfileId(sets[0]);
  const active = contents(await client.snapshot(profile, result.head.active));
  assert.deepEqual(active, { "SKY-VM.001": "variant 3", "SKY-VM.002": "1", "SKY-VM.003": "2", "SKY-VM.004": "3" });
  for (const set of sets) {
    assert.equal((await client.snapshot(profile, set.hash)).hash, set.hash);
    assert.ok(result.head.alternatives.includes(set.hash));
  }
});

test("equal timestamps converge independently of listing order and device identity", async () => {
  const sets = await Promise.all(["left", "away", "third"].map((value) => save({ "SKY-VM.001": value })));
  const outcomes = [];
  for (const order of [sets, [...sets].reverse(), [sets[1], sets[2], sets[0]]]) {
    const server = fakeNativeStorage();
    for (const set of order) await writeSnapshot(server, await makeSnapshot(set));
    outcomes.push((await publish(server, order[0])).head.active);
  }
  assert.equal(new Set(outcomes).size, 1);
  assert.equal(outcomes[0], [...sets].sort((a, b) => a.hash.localeCompare(b.hash))[0].hash);
});

test("changed companion indexes select a coherent whole copy while preserving alternatives", async () => {
  const first = await save({ "SKY-VM.001": "old slot", "SKY-VM.SAV": "old index" }, 100);
  const second = await save({ "SKY-VM.002": "new slot", "SKY-VM.SAV": "new index" }, 200);
  const result = await automaticSaveMerge([first, second]);
  assert.equal(result.selected, true);
  assert.equal(result.set.hash, second.hash);
  assert.deepEqual(contents(result.set), contents(second));
});

test("automatic file/folder collision handling always restores a valid complete layout", async () => {
  const flat = await save({ "slot": "file" }, 100), nested = await save({ "slot/data": "nested" }, 200);
  assert.equal((await automaticSaveMerge([flat, nested])).set.hash, nested.hash);
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
  const client = await createSaveCollection(server), empty = await client.snapshot(await saveProfileId(base), result.head.active);
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
  const bases = commonSaveAncestorNodes([a, b, c, d], [c, d]).map(({ set }) => set);
  assert.deepEqual(bases, [a.set, b.set]);
  assert.equal((await mergeSaveSets([c.set, d.set], bases)).set, null);
});


test("manual imports keep separate slots and intentionally prefer incoming overlapping slots", async () => {
  const current = await save({ "SKY-VM.001": "current", "SKY-VM.002": "separate" }, 300);
  const incoming = await save({ "SKY-VM.001": "imported", "SKY-VM.003": "new slot" }, 100);
  const result = await preferredSaveMerge([incoming, current]);
  assert.deepEqual(contents(result.set), { "SKY-VM.001": "imported", "SKY-VM.002": "separate", "SKY-VM.003": "new slot" });
});
