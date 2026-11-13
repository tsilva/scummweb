import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { createBugReportHandler } from "../lib/bug-report-handler.mjs";
import { reportGameIdentity } from "../lib/bug-report.mjs";

const catalog = [{ target: "sky", engineId: "sky", gameId: "sky", title: "Beneath a Steel Sky", language: "en" }];
function request({ metadata = {}, message = "The sound stopped.", files = [], origin = "https://example.test", headers = {} } = {}) {
  const form = new FormData();
  form.set("message", message);
  form.set("metadata", JSON.stringify({ version: 1, reportId: randomUUID(), game: { source: "catalog", target: "sky" },
    capture: { status: files.length ? "captured" : "unavailable", slot: 1, files: files.map(({ name }) => ({ name })) }, ...metadata }));
  files.forEach(({ name, bytes }, i) => form.set(`save-${i}`, new Blob([bytes]), name));
  return new Request("https://example.test/api/bug-report", { method: "POST", body: form,
    headers: { origin, "x-real-ip": "127.0.0.1", ...headers } });
}
function fixture(send) {
  const reports = [];
  const post = createBugReportHandler({ enabled: () => true, games: () => catalog,
    send: send || ((report) => { reports.push(report); return "event-id"; }) });
  return { post, reports };
}

test("collector attaches verified save bytes and a reproduction manifest with canonical catalog identity", async () => {
  const { post, reports } = fixture();
  const response = await post(request({ files: [{ name: "SKY-VM.001", bytes: new Uint8Array([1, 2, 3]) }],
    metadata: { game: { source: "catalog", target: "sky", title: "spoofed", zip: "https://private.test/token" },
      player: { volume: 80, speed: 1.5, subtitles: true, token: "private" }, runtimeVersion: "build-123" } }));
  assert.equal(response.status, 200);
  assert.equal(reports.length, 1);
  assert.equal(reports[0].manifest.game.title, "Beneath a Steel Sky");
  assert.equal(reports[0].manifest.game.engineId, "sky");
  assert.deepEqual([...reports[0].attachments[0].data], [1, 2, 3]);
  assert.equal(reports[0].manifest.capture.files[0].sha256, "039058c6f2c0cb492c533b0a4d14ef77cc0f78abccced5287d84a1a2011cfb81");
  const manifest = new TextDecoder().decode(reports[0].attachments.at(-1).data);
  assert.doesNotMatch(manifest, /private|spoofed|token|zip/);
  assert.match(manifest, /SKY-VM\.001/);
});

test("reports without a snapshot remain useful, and imported metadata excludes personal titles and paths", async () => {
  const game = { source: "local", engineId: "scumm", gameId: "monkey", title: "Personal file", target: "private-file", zip: "private" };
  assert.deepEqual(reportGameIdentity(game), { source: "local", engineId: "scumm", gameId: "monkey" });
  const { post, reports } = fixture();
  assert.equal((await post(request({ metadata: { game, capture: { status: "timeout", files: [] } } }))).status, 200);
  assert.equal(reports[0].attachments.length, 1);
  assert.equal(reports[0].manifest.capture.status, "timeout");
  assert.doesNotMatch(JSON.stringify(reports[0].manifest), /private|Personal/);
});

test("collector rejects foreign origins, unknown games, missing descriptions, unsafe filenames and oversized saves", async () => {
  for (const data of [
    { origin: "https://attacker.test" },
    { metadata: { game: { source: "catalog", target: "unknown" } } },
    { message: " " },
    { metadata: { reportId: { toString: null } } },
    { files: [{ name: "../save", bytes: "bad" }] },
    { files: [{ name: "save.001", bytes: new Uint8Array(2097153) }] },
    { metadata: { capture: { status: "captured", slot: 1, files: [] } } },
  ]) {
    const { post, reports } = fixture();
    assert.ok((await post(request(data))).status >= 400);
    assert.equal(reports.length, 0);
  }
});

test("collector bounds streaming bodies even without Content-Length", async () => {
  const { post, reports } = fixture();
  const req = new Request("https://example.test/api/bug-report", { method: "POST", duplex: "half",
    headers: { origin: "https://example.test", "content-type": "multipart/form-data; boundary=test" },
    body: new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array(3145729)); controller.close(); } }) });
  assert.equal((await post(req)).status, 413);
  assert.equal(reports.length, 0);
});

test("retries are idempotent, conflicts are rejected, and failed delivery remains retryable", async () => {
  const { post, reports } = fixture();
  const metadata = { reportId: randomUUID() };
  for (let i = 0; i < 3; i++) {
    const response = await post(request({ metadata }));
    assert.equal(response.status, 200);
    assert.equal((await response.json()).ok, true);
  }
  assert.equal(reports.length, 1);
  assert.equal((await post(request({ metadata, message: "Different report" }))).status, 409);
  let attempts = 0;
  const retry = fixture(() => { if (!attempts++) throw new Error("offline"); return "event"; });
  assert.equal((await retry.post(request({ metadata }))).status, 502);
  assert.equal((await retry.post(request({ metadata }))).status, 200);
});

test("disabled collection is explicit, and repeated submissions are rate limited", async () => {
  const disabled = createBugReportHandler({ enabled: () => false });
  assert.equal((await disabled(request())).status, 503);
  const { post } = fixture();
  for (let i = 0; i < 5; i++) assert.equal((await post(request())).status, 200);
  assert.equal((await post(request())).status, 429);
});
