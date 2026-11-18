import assert from "node:assert/strict";
import test from "node:test";
import { trackCloudTransfers, transferProgressLabel } from "../app/cloud/transfer-progress.mjs";

test("metadata is silent; upload and mandatory readback measure real bytes and retain the game", async () => {
  const events = [], payload = new Blob([new Uint8Array(100)]);
  let confirm, uploading;
  const gate = new Promise(resolve => { confirm = resolve; });
  const client = trackCloudTransfers({
    async list() { return []; }, async listImports() { return []; },
    async upload(name, blob, { onProgress }) {
      assert.equal(blob, payload); uploading = onProgress;
      await gate; onProgress({ loaded: 84, total: 100 });
    },
    async download(name, { onProgress }) { onProgress({ loaded: 42, total: 100 }); return payload; },
  }, event => events.push(event));
  await client.list(); await client.listImports(); assert.equal(events.length, 0);
  const upload = client.upload("snapshot", payload, { title: "Beneath a Steel Sky" });
  assert.equal(events.at(-1).percentage, 0);
  confirm(); await upload;
  assert.ok(events.some(event => event.stage === "upload" && event.percentage === 42));
  assert.equal(events.at(-1).percentage, 50);
  const beforeLate = events.length;
  uploading({ loaded: 100, total: 100 }); assert.equal(events.length, beforeLate, "ignore late callbacks");
  assert.equal(await client.download("snapshot"), payload);
  assert.ok(events.some(event => event.stage === "verify" && event.percentage === 71));
  client.verified("snapshot", { destination: { title: "Beneath a Steel Sky" } });
  assert.equal(events.at(-1).percentage, 100);
  assert.ok(events.every(event => event.title === "Beneath a Steel Sky"));
});

test("incoming and copied saves show received-byte percentages; unknown totals remain indeterminate", async () => {
  const events = [];
  const client = trackCloudTransfers({
    async download(name, { onProgress }) {
      onProgress({ loaded: 42, total: 100 });
      onProgress({ loaded: 60, total: 0 });
      return new Blob([new Uint8Array(100)]);
    },
    async downloadImport(name, { size, onProgress }) { assert.equal(size, 100); onProgress({ loaded: 25, total: 100 }); return new Blob(); },
  }, event => events.push(event));
  await client.download("known", { title: "Known game" });
  assert.equal(events[1].percentage, 42); assert.equal(events[2].percentage, null);
  assert.equal(transferProgressLabel(events[1]), "42% · Known game · Downloading");
  client.verified("known", { destination: { title: "Verified game" } });
  assert.equal(events.at(-1).title, "Verified game");
  await client.downloadImport("save.001", { title: "Copied game", size: 100 });
  assert.ok(events.some(event => event.title === "Copied game" && event.percentage === 25));
});

test("unidentified snapshots keep the previous verified game visible until the next named game", async () => {
  const events = [];
  const client = trackCloudTransfers({ async download(name, { onProgress }) {
    onProgress({ loaded: 8, total: 16 });
    return new Blob([new Uint8Array(16)]);
  } }, event => events.push(event));
  await client.download("first");
  assert.deepEqual(events, [null]);
  client.verified("first", { destination: { title: "Beneath a Steel Sky" } });
  assert.equal(transferProgressLabel(events.at(-1)), "100% · Beneath a Steel Sky · Verifying");
  await client.download("second");
  assert.equal(events.length, 2);
  client.verified("second", { destination: { title: "Flight of the Amazon Queen" } });
  assert.equal(transferProgressLabel(events.at(-1)), "100% · Flight of the Amazon Queen · Verifying");
});

test("failure never reports completion or allows late progress to replace the error", async () => {
  const events = [], error = Error("lost reply"); let late;
  const client = trackCloudTransfers({ async upload(name, blob, { onProgress }) { late = onProgress; throw error; } }, event => events.push(event));
  await assert.rejects(client.upload("snapshot", new Blob(["save"])), failure => failure === error);
  late({ loaded: 4, total: 4 });
  assert.deepEqual(events, [null]);
  assert.equal(transferProgressLabel(null), "");
  assert.equal(transferProgressLabel({ stage: "upload", direction: "upload", percentage: -1 }), "");
});
