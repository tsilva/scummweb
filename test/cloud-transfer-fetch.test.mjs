import assert from "node:assert/strict";
import test from "node:test";
import { createCloudTransferFetch } from "../web-shell/cloud-transfer-fetch.mjs";

const endpoint = path => `https://content.dropboxapi.com/2/files/${path}`;
test("upload percentage counts confirmed offsets, never sent buffers or failed responses", async () => {
  const transfer = { op: "upload", total: 100 }, events = [];
  let reply;
  const response = new Promise(resolve => { reply = resolve; });
  const options = { body: new Uint8Array(42), headers: { "Dropbox-API-Arg": JSON.stringify({ cursor: { offset: 0 } }) }, redirect: "error", credentials: "omit" };
  const observed = createCloudTransferFetch((url, actual) => { assert.equal(actual, options); return response; }, () => transfer,
    (operation, bytes) => { assert.equal(operation, transfer); events.push(bytes); });
  const flight = observed(endpoint("upload_session/append_v2"), options);
  assert.equal(events.length, 0);
  const ok = new Response("{}"); reply(ok); assert.equal(await flight, ok);
  assert.deepEqual(events, [{ loaded: 42, total: 100 }]);
  // Retrying the same confirmed chunk must not count its bytes twice.
  await observed(endpoint("upload_session/append_v2"), options);
  assert.equal(events.at(-1).loaded, 42);
  const failed = createCloudTransferFetch(async () => new Response("error", { status: 500 }), () => transfer, () => assert.fail("failed request is not progress"));
  await failed(endpoint("upload"), options);
});

test("downloads report actual stream chunks with identical bytes, status, headers and cancellation", async () => {
  const transfer = { op: "download", total: 100 }, events = [];
  let cancelled = false;
  const source = new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array(42).fill(7)); }, cancel() { cancelled = true; } });
  const observed = createCloudTransferFetch(async () => new Response(source, { headers: { "Content-Length": "100", "X-Native": "kept" } }), () => transfer,
    (operation, bytes) => events.push(bytes));
  const response = await observed(endpoint("download"));
  assert.equal(response.status, 200); assert.equal(response.headers.get("X-Native"), "kept");
  const reader = response.body.getReader();
  assert.deepEqual((await reader.read()).value, new Uint8Array(42).fill(7));
  assert.deepEqual(events, [{ loaded: 42, total: 100 }]);
  await reader.cancel(); assert.equal(cancelled, true);
});

test("metadata, provider errors, and stale operations never impersonate save transfers", async () => {
  const response = new Response("metadata"), transfer = { op: "upload", total: 100 };
  let current = transfer;
  const observed = createCloudTransferFetch(async () => response, () => current, () => assert.fail("metadata must stay quiet"));
  assert.equal(await observed("runtime-assets.json"), response);
  assert.equal(await observed("https://api.dropboxapi.com/oauth2/token"), response);
  assert.equal(await observed("https://other.test/2/files/upload", { body: new Uint8Array(42) }), response);
  const stale = createCloudTransferFetch(async () => { current = null; return response; }, () => current, () => assert.fail("late progress must be ignored"));
  await stale(endpoint("upload"), { body: new Uint8Array(42), headers: {} });
});

test("absent and underestimated download sizes stay indeterminate without buffering another copy", async () => {
  for (const total of [0, 3]) {
    const events = [], transfer = { op: "download-import", total };
    const observed = createCloudTransferFetch(async () => new Response(new Uint8Array(5)), () => transfer, (_, bytes) => events.push(bytes));
    const response = await observed(endpoint("download"));
    assert.equal((await response.arrayBuffer()).byteLength, 5);
    assert.deepEqual(events, [{ loaded: 5, total: 0 }]);
  }
});
