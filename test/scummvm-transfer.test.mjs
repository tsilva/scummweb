import assert from "node:assert/strict";
import test from "node:test";
import { BlobReader, BlobWriter, TextReader, Uint8ArrayWriter, ZipReader, ZipWriter } from "@zip.js/zip.js";
import { exportScummvmSaves, readSaveImport } from "../app/save-backups/scummvm-transfer.mjs";
import { getSaveDestinations, identifySet, exportBackup } from "../app/save-backups/backups.mjs";

const bytes = (text) => new TextEncoder().encode(text);
const destinations = await getSaveDestinations([{ target: "sky", displayTitle: "Beneath a Steel Sky" },
  { target: "queen", displayTitle: "Flight of the Amazon Queen" }], []);
const sky = { ...destinations[0], isolated: true }, queen = { ...destinations[1], isolated: true };
async function set(destination, contents) {
  const set = { destination, files: Object.entries(contents).map(([path, text]) => ({ path, data: bytes(text), modifiedAt: 1700000000000 })) };
  return { ...set, hash: await identifySet(set) };
}
const file = (name, text) => new File([text], name, { lastModified: 1700000000000 });
async function zip(contents) {
  const writer = new ZipWriter(new BlobWriter(), { useWebWorkers: false, level: 0 });
  for (const [name, text] of Object.entries(contents)) await writer.add(name, new TextReader(text));
  return writer.close();
}

test("desktop exports contain native filenames and byte-exact files without a manifest", async () => {
  const original = await set(sky, { "SKY-VM.001": "native slot", "SKY-VM.SAV": "native descriptions" });
  const reader = new ZipReader(new BlobReader(await exportScummvmSaves([original])), { useWebWorkers: false });
  try {
    const entries = await reader.getEntries();
    assert.equal(entries.length, 2);
    for (const originalFile of original.files) {
      const entry = entries.find(({ filename }) => filename.endsWith(`/current/${originalFile.path}`));
      assert.ok(entry);
      assert.deepEqual(await entry.getData(new Uint8ArrayWriter()), originalFile.data);
    }
    assert.ok(entries.every(({ filename }) => !filename.includes("manifest.json")));
  } finally { await reader.close(); }
});

test("ordinary raw saves and a standard desktop ZIP import with companions into isolated editions", async () => {
  const originals = [file("SKY-VM.001", "slot"), file("SKY-VM.SAV", "index"), file("queen.s01", "queen")];
  for (const inputs of [originals, [await zip({ "desktop/SKY-VM.001": "slot", "desktop/SKY-VM.SAV": "index", "desktop/queen.s01": "queen" })]]) {
    const sets = await readSaveImport(inputs, destinations);
    assert.equal(sets.length, 2);
    assert.ok(sets.every(({ destination }) => destination.isolated));
    assert.deepEqual(sets.find(({ destination }) => destination.family === "sky").files.map(({ path }) => path).sort(), ["SKY-VM.001", "SKY-VM.SAV"]);
  }
});

test("active and recovery copies of the same filename remain separate through a native ZIP round trip", async () => {
  const active = await set(sky, { "SKY-VM.001": "current", "SKY-VM.SAV": "index" });
  const older = await set(sky, { "SKY-VM.001": "older", "SKY-VM.SAV": "old index" });
  const sets = await readSaveImport([await exportScummvmSaves([active, { ...active, id: "duplicate" }, { ...older, id: "recovery" }])], destinations);
  assert.equal(sets.length, 2);
  assert.equal(sets[0].hash, active.hash); assert.equal(sets[0].recovery, undefined);
  assert.equal(sets[1].hash, older.hash); assert.equal(sets[1].recovery, true);
});

test("different imported editions round trip without filename collisions or browser source identities", async () => {
  const sources = ["a", "b"].map((value) => ({ id: value, name: "Same Game.zip", fingerprint: value.repeat(64) }));
  const sourceDestinations = await getSaveDestinations([], sources);
  const originals = await Promise.all(sourceDestinations.filter(({ fingerprint }) => fingerprint).map((destination, index) => set(destination, { "game.001": `edition ${index}` })));
  const blob = await exportScummvmSaves(originals);
  const otherBrowser = await getSaveDestinations([], sources.map((source) => ({ ...source, id: source.id + "-other-browser" })));
  const imported = await readSaveImport([blob], otherBrowser);
  assert.equal(imported.length, 2);
  assert.deepEqual(imported.map(({ hash }) => hash).sort(), originals.map(({ hash }) => hash).sort());
  assert.ok(imported.every(({ destination }) => otherBrowser.some(({ key }) => key === destination.key)));
  const missing = await readSaveImport([blob], []);
  assert.deepEqual(missing.map(({ destination }) => destination.fingerprint).sort(), sources.map(({ fingerprint }) => fingerprint).sort());
});

test("unrecognized ordinary filenames require one explicit matching game, never a guessed destination", async () => {
  const inputs = [file("custom.001", "progress")];
  await assert.rejects(readSaveImport(inputs, destinations), { kind: "choose-game" });
  const [imported] = await readSaveImport(inputs, destinations, queen.key);
  assert.equal(imported.destination.key, queen.key);
  assert.equal(imported.destination.isolated, true);
  assert.equal(imported.files[0].path, "custom.001");
});

test("missing Sky companions, empty saves, duplicate case and traversal are rejected", async () => {
  await assert.rejects(readSaveImport([file("SKY-VM.001", "slot")], destinations), /SKY-VM.SAV/);
  await assert.rejects(readSaveImport([file("queen.s01", "")], destinations), /nonempty/);
  await assert.rejects(readSaveImport([file("queen.s01", "one"), file("QUEEN.S01", "two")], destinations), /duplicate/);
  await assert.rejects(readSaveImport([file("../queen.s01", "bad")], destinations), /filename/);
  await assert.rejects(readSaveImport([await zip({ "../queen.s01": "bad" })], destinations), /unsupported|Unsafe filename/);
  await assert.rejects(readSaveImport([await zip({ "queen.s01": "one", "QUEEN.S01": "two" })], destinations), /duplicate/);
});

test("archive expansion and input collection limits are enforced before importing", async () => {
  await assert.rejects(readSaveImport(Array.from({ length: 4097 }, () => file("queen.s01", "data")), destinations), /64 MiB/);
  const compressed = new ZipWriter(new BlobWriter(), { useWebWorkers: false, level: 6 });
  await compressed.add("queen.s01", new TextReader("x".repeat(64 * 1024 * 1024 + 1)));
  await assert.rejects(readSaveImport([await compressed.close()], destinations), /exceeds 64 MiB/);
});

test("cloud archives can still be deliberately imported for recovery", async () => {
  const original = await set(queen, { "queen.s01": "progress" });
  assert.equal((await readSaveImport([await exportBackup([original])], destinations))[0].hash, original.hash);
});


test("duplicate installations of one edition export as current and recovery without filename collisions", async () => {
  const sourceDestinations = await getSaveDestinations([], ["one", "two"].map((id) => ({ id, name: "Same Game.zip", fingerprint: "c".repeat(64) })));
  const sets = await Promise.all(sourceDestinations.filter(({ fingerprint }) => fingerprint).map((destination, index) => set(destination, { "game.001": `copy ${index}` })));
  const imported = await readSaveImport([await exportScummvmSaves(sets)], []);
  assert.equal(imported.length, 2);
  assert.equal(imported[0].recovery, undefined);
  assert.equal(imported[1].recovery, true);
  assert.deepEqual(imported.map(({ hash }) => hash).sort(), sets.map(({ hash }) => hash).sort());
});
