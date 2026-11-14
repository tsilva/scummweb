import assert from "node:assert/strict";
import test from "node:test";
import { discoverLooseSaves } from "../app/dropbox/loose-import.mjs";
import { getSaveDestinations } from "../app/save-backups/backups.mjs";

const destinations = await getSaveDestinations([{ target: "sky", displayTitle: "Beneath a Steel Sky" },
  { target: "queen", displayTitle: "Flight of the Amazon Queen" }], []);
function inbox(files) {
  const blobs = new Map(Object.entries(files).map(([name, data]) => [name, new Blob([data])]));
  return { listImports: async () => [...blobs].map(([name, blob]) => ({ name, size: blob.size })), downloadImport: async (name) => blobs.get(name) };
}
test("loose saves retain slot names, bytes and companions in isolated game editions", async () => {
  const result = await discoverLooseSaves(inbox({ "SKY-VM.001": "slot", "SKY-VM.SAV": "companion", "queen.s01": "queen" }), destinations);
  assert.equal(result.message, "");
  assert.equal(result.sets.length, 2);
  const sky = result.sets.find((set) => set.destination.family === "sky");
  assert.equal(sky.destination.isolated, true);
  assert.deepEqual(sky.files.map((file) => file.path), ["SKY-VM.001", "SKY-VM.SAV"]);
  assert.equal(new TextDecoder().decode(sky.files[0].data), "slot");
});
test("missing BASS companions and unknown names produce useful errors without guessing", async () => {
  const result = await discoverLooseSaves(inbox({ "SKY-VM.001": "slot", "unknown.001": "other", "timestamps": "metadata" }), destinations);
  assert.equal(result.sets.length, 0);
  assert.match(result.message, /SKY-VM.SAV/);
  assert.match(result.message, /could not be matched/);
});
test("unsafe paths, case collisions, oversized collections and changing files fail closed", async () => {
  for (const files of [{ "../queen.s01": "bad" }, { "queen.s01": "a", "QUEEN.S01": "b" }]) {
    await assert.rejects(discoverLooseSaves(inbox(files), destinations), /invalid or duplicate/);
  }
  await assert.rejects(discoverLooseSaves({ listImports: async () => [{ name: "queen.s01", size: 64 * 1024 * 1024 }] }, destinations), /63 MiB/);
  await assert.rejects(discoverLooseSaves({ listImports: async () => [{ name: "queen.s01", size: 4 }], downloadImport: async () => new Blob(["bigger"]) }, destinations), /changed during import/);
});
