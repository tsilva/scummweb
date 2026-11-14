import assert from "node:assert/strict";
import test from "node:test";
import { authorizationRequest, exchangeCode } from "../app/dropbox/client.mjs";
import { createSaveCollection, makeSnapshot, profileHistory, publishProfile, readNode, reconcileSave, saveProfileId, writeSnapshot } from "../app/dropbox/protocol.mjs";
import { cloudProviders, dropboxNativeConfig } from "../app/cloud/native-client.mjs";
import { exportBackup, getActiveSaveSets, getSaveDestinations, identifySet, readBackup } from "../app/save-backups/backups.mjs";
import { capturePlayerSaveSet } from "../app/dropbox/player-snapshot.mjs";
import { saveIndexKey, defaultSavePath } from "../web-shell/continue-saves.mjs";
import { browserSaveStorage, fakeNativeStorage } from "./helpers/dropbox-fixtures.mjs";
const bytes = (text) => new TextEncoder().encode(text);
async function save(value, destination = { key: "catalog:sky", family: "sky", namespace: "", title: "Beneath a Steel Sky", isolated: true }) {
  const set = { destination, files: [{ path: "SKY-VM.001", data: bytes(value), modifiedAt: 100 }, { path: "SKY-VM.INF", data: bytes("companion"), modifiedAt: 100 }] };
  return { ...set, hash: await identifySet(set) };
}
async function publish(server, local, args = {}) {
  const client = await createSaveCollection(server);
  return publishProfile({ client, profile: await saveProfileId(local), local, ...args });
}
test("authorization uses offline PKCE S256, exact redirect, state, narrow scopes and no secret", async () => {
  const request = await authorizationRequest("public-app-key", "https://example.test");
  const url = new URL(request.url);
  assert.equal(url.searchParams.get("token_access_type"), "offline");
  assert.equal(url.searchParams.get("code_challenge_method"), "S256");
  assert.equal(url.searchParams.get("state"), request.state);
  assert.equal(url.searchParams.get("redirect_uri"), "https://example.test/dropbox-callback.html");
  assert.ok(request.verifier.length >= 43);
  assert.ok(!url.searchParams.has("client_secret"));
  let options;
  const auth = await exchangeCode("public-app-key", request, "synthetic-code", async (_, value) => {
    options = value; return Response.json({ access_token: "synthetic", refresh_token: "synthetic-refresh", account_id: "dbid:test", expires_in: 14400 });
  });
  assert.equal(auth.refreshToken, "synthetic-refresh");
  assert.equal(options.credentials, "omit"); assert.equal(options.redirect, "error");
  assert.equal(options.body.get("code_verifier"), request.verifier);
});
test("a connection without refresh credentials is rejected", async () => {
  await assert.rejects(exchangeCode("key", {}, "code", async () => Response.json({ access_token: "x", account_id: "id", expires_in: 3600 })), /invalid connection/);
});
test("native provider IDs leave other providers disabled until they have an auth adapter", () => {
  assert.equal(cloudProviders.dropbox.nativeId, 1); assert.equal(cloudProviders.googledrive.nativeId, 3);
  assert.equal(cloudProviders.googledrive.enabled, false);
  assert.match(dropboxNativeConfig({ token: "access", refreshToken: "refresh" }, "public-key"), /current_storage=1/);
  assert.throws(() => dropboxNativeConfig({ token: "access\n[cloud]", refreshToken: "refresh" }, "key"));
});
test("reconciliation uses contents and shared ancestry rather than timestamps", () => {
  assert.equal(reconcileSave("a", "b", "a"), "upload");
  assert.equal(reconcileSave("a", "a", "b"), "download");
  assert.equal(reconcileSave("a", "b", "c"), "conflict");
});
test("fingerprints reconnect imported editions with different local namespaces", async () => {
  const a = await save("a", { key: "a", fingerprint: "f".repeat(64) });
  const b = await save("a", { key: "b", fingerprint: "f".repeat(64) });
  assert.equal(await saveProfileId(a), await saveProfileId(b));
});
test("cloud snapshots remain ordinary importable v1 backups, including companion files", async () => {
  const set = await save("progress"), server = fakeNativeStorage(), node = await makeSnapshot(set);
  await writeSnapshot(server, node);
  const [restored] = await readBackup(server.files.get(`${node.id}.zip`));
  assert.equal(restored.hash, set.hash); assert.deepEqual(restored.files, set.files);
});
test("collection refresh reuses verified history while observing new and deleted remote snapshots", async () => {
  const server = fakeNativeStorage(), local = await save("base"), profile = await saveProfileId(local);
  await publish(server, local);
  const saved = new Map();
  let loads = 0, downloads = 0, listings = 0;
  const transport = { ...server,
    async list() { listings++; return server.list(); },
    async download(name) { downloads++; return server.download(name); },
  };
  const client = await createSaveCollection(transport, {
    async load(id) { loads++; return saved.get(id); },
    async save(node) { saved.set(node.id, node); },
  });
  const baseTips = client.head(profile).tips;
  for (let pass = 0; pass < 3; pass++) await publishProfile({ client, profile, local, base: local.hash, baseTips });
  assert.equal(loads, 1, "unchanged history must not be reread from IndexedDB for each game");
  assert.equal(downloads, 1);
  assert.equal(listings, 4, "each refresh still checks Dropbox for concurrent changes");
  const remote = await save("other device");
  const newer = await publish(server, remote, { base: local.hash, baseTips });
  const result = await publishProfile({ client, profile, local, base: local.hash, baseTips });
  assert.equal(result.action, "download");
  assert.equal(result.head.active, remote.hash);
  assert.equal(loads, 2); assert.equal(downloads, 2);
  // Reuse must not hide remote deletions or missing ancestry.
  server.files.delete(`${baseTips[0]}.zip`);
  await assert.rejects(publishProfile({ client, profile, local: remote, base: remote.hash, baseTips: newer.head.tips }), /incomplete/);
});
for (const afterCommit of [false, true]) test(`interrupted upload resumes ${afterCommit ? "after" : "before"} durable remote commit`, async () => {
  const server = fakeNativeStorage(), set = await save("latest");
  if (afterCommit) server.failAfterUpload = true; else server.offline = true;
  await assert.rejects(publish(server, set));
  server.offline = false;
  const result = await publish(server, set);
  assert.equal(result.head.active, set.hash); assert.equal(server.files.size, 1);
});
test("independent writers retain both histories and resolution joins every observed tip", async () => {
  const server = fakeNativeStorage(), base = await save("base");
  const initial = await publish(server, base);
  const left = await save("left"), right = await save("right"), profile = await saveProfileId(base);
  await publish(server, left, { base: base.hash, baseTips: initial.head.tips });
  const conflict = await publish(server, right, { base: base.hash, baseTips: initial.head.tips });
  assert.equal(conflict.action, "conflict"); assert.equal(conflict.head.tips.length, 2);
  const resolved = await publish(server, right, { resolve: true, expectedTips: conflict.head.tips, alternatives: [left, right] });
  assert.equal(resolved.head.active, right.hash); assert.equal(resolved.head.concurrent, false);
  assert.equal(server.files.size, 6);
  assert.ok(resolved.head.alternatives.includes(left.hash));
  const collection = await createSaveCollection(server);
  assert.equal(collection.snapshot(profile, left.hash).hash, left.hash);
});
test("a stale conflict choice cannot consume a newly published branch", async () => {
  const server = fakeNativeStorage(), a = await save("a"), b = await save("b"), c = await save("c");
  await publish(server, a); const conflict = await publish(server, b);
  await publish(server, c);
  await assert.rejects(publish(server, b, { resolve: true, expectedTips: conflict.head.tips }), /changed while/);
  assert.equal(server.files.size, 3);
});
test("identical saves on independent branches merge automatically", async () => {
  const server = fakeNativeStorage(), base = await save("base"), latest = await save("latest");
  const first = await publish(server, base);
  await writeSnapshot(server, await makeSnapshot(latest, first.head.tips));
  await writeSnapshot(server, await makeSnapshot(latest));
  const result = await publish(server, latest, { base: base.hash, baseTips: first.head.tips });
  assert.equal(result.head.concurrent, false); assert.equal(result.head.active, latest.hash);
});
test("recovery copies are uploaded without becoming active progress", async () => {
  const server = fakeNativeStorage(), set = await save("active"), older = await save("older");
  const result = await publish(server, set, { alternatives: [older] });
  assert.equal(result.head.active, set.hash); assert.deepEqual(result.head.alternatives, [older.hash]);
});
test("missing ancestry fails closed instead of resurrecting a stale device", async () => {
  const server = fakeNativeStorage(), base = await save("base"), latest = await save("latest");
  const initial = await publish(server, base);
  await publish(server, latest, { base: base.hash, baseTips: initial.head.tips });
  server.files.delete(`${initial.head.tips[0]}.zip`);
  await assert.rejects(publish(server, base, { base: base.hash, baseTips: initial.head.tips }), /incomplete/);
});
test("tampered archive identity and wrong game metadata cannot restore saves", async () => {
  const server = fakeNativeStorage(), set = await save("progress"), node = await makeSnapshot(set);
  server.files.set(`${node.id}.zip`, await exportBackup([set], { cloud: { ...node, profile: "a".repeat(64) } }));
  await assert.rejects(readNode(server, node.id), /verification/);
});
test("cycles and missing parents are rejected", () => {
  const id = "a".repeat(64), profile = "b".repeat(64);
  assert.throws(() => profileHistory([{ id, profile, active: true, parents: [id] }], profile), /incomplete/);
});
test("player capture refuses pending native writes and excludes agent scopes", () => {
  let index = JSON.stringify({ pending: [], saves: [{ name: "SKY-VM.001" }] });
  const key = saveIndexKey("", "sky");
  const player = { location: { href: "https://example.test/scummvm.html?hostPlayer=1&catalogSaveTarget=sky" },
    __scummwebSaveStatus: { target: "sky" }, localStorage: { getItem: (name) => name === key ? index : null },
    FS: { readdir: () => [".", "..", "SKY-VM.001", "SKY-VM.INF", "timestamps"], lstat: () => ({ mode: 1, size: 5, mtime: 100 }),
      isDir: () => false, isFile: () => true, readFile: (path) => bytes(path === defaultSavePath + "/SKY-VM.INF" ? "index" : "save!") } };
  assert.equal(capturePlayerSaveSet(player, { displayTitle: "Sky" }).files.length, 2);
  index = JSON.stringify({ pending: ["SKY-VM.001"] });
  assert.equal(capturePlayerSaveSet(player, {}), null);
  index = JSON.stringify({ pending: [], saves: [] });
  player.location.href += "&agentSaveScope=" + "a".repeat(64);
  assert.equal(capturePlayerSaveSet(player, {}), null);
});

test("native cloud bookkeeping does not create a shared save profile during migration", async () => {
  const storage = browserSaveStorage({ "SKY-VM.001": bytes("progress"), timestamps: bytes("native metadata") });
  const destinations = await getSaveDestinations([{ target: "sky", displayTitle: "Sky" }], []);
  const { sets } = await getActiveSaveSets(storage, destinations);
  assert.equal(sets.length, 1);
  assert.deepEqual(sets[0].files.map(({ path }) => path), ["SKY-VM.001"]);
});
