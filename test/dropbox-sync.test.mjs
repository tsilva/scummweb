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
    revision: (name) => name,
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
test("bounded verification and a shared upload refresh retain every original snapshot", async () => {
  const server = fakeNativeStorage(), originals = [];
  for (let index = 0; index < 9; index++) {
    const namespace = `version-${index.toString(16).repeat(64)}`;
    const set = await save(`original ${index}`, { key: namespace, namespace, title: `Game ${index}` });
    originals.push(await writeSnapshot(server, await makeSnapshot(set)));
  }
  let listings = 0, downloads = 0, inFlight = 0, peak = 0;
  const initialArchives = new Map(server.files);
  const cached = new Map();
  const transport = { ...server,
    parallelDownloads: 4,
    size: name => server.files.get(name).size,
    async list() { listings++; return server.list(); },
    async download(name, { onRevision } = {}) {
      downloads++;
      peak = Math.max(peak, ++inFlight);
      try {
        await new Promise(resolve => setTimeout(resolve, 5));
        const blob = await server.download(name);
        onRevision?.(server.revision(name));
        return blob;
      } finally { inFlight--; }
    },
    async upload(name, blob) {
      assert.equal(inFlight, 0, "writes and reads use separate phases");
      await server.upload(name, blob);
    },
  };
  const collection = await createSaveCollection(transport, {
    load: (id, revision) => cached.get(id)?.revision === revision ? cached.get(id) : undefined,
    save: node => cached.set(node.id, node),
  });
  assert.equal(downloads, 9);
  assert.equal(peak, 4);
  const updates = await Promise.all(originals.map(async ({ profile, id, set }) => ({
    profile, local: await save("changed", set.destination), base: set.hash, baseTips: [id],
  })));
  for (const update of updates) await collection.stage(update);
  assert.equal(downloads, 18, "each upload is read back exactly once");
  assert.equal(await collection.refresh(), false);
  for (const update of updates) assert.equal((await collection.reconcile(update)).head.active, update.local.hash);
  assert.equal(downloads, 18, "an identical revision reuses already verified bytes");
  assert.equal(listings, 2);
  for (const [name, blob] of initialArchives) assert.equal(server.files.get(name), blob);
});
test("history beyond the previous 256 MiB limit keeps every node and reads older bytes on demand", async () => {
  const server = fakeNativeStorage();
  const original = await save("large checkpoint");
  const files = [{ path: "SKY-VM.001", data: new Uint8Array(16 * 1024 * 1024), modifiedAt: 1 }];
  const set = { destination: original.destination, files };
  set.hash = await identifySet(set);
  let parents = [];
  let first;
  for (let i = 1; i <= 17; i++) {
    files[0].modifiedAt = i;
    const node = await makeSnapshot(set, parents);
    await writeSnapshot(server, node);
    first ||= node.id;
    parents = [node.id];
  }
  const originalNames = [...server.files.keys()];
  const records = new Map();
  const cache = { load: (id, revision) => records.get(id)?.revision === revision ? records.get(id) : undefined,
    save(node) { assert.equal("set" in node, false); records.set(node.id, node); } };
  let downloads = 0;
  const transport = { ...server, download(name) { downloads++; return server.download(name); } };
  const firstClient = await createSaveCollection(transport, cache);
  assert.equal(downloads, originalNames.length);
  const profile = await saveProfileId(set);
  assert.deepEqual(firstClient.head(profile).tips, parents);
  const reopened = await createSaveCollection(transport, cache);
  assert.equal(downloads, originalNames.length, "routine sync uses verified metadata on restart");
  assert.equal((await reopened.snapshot(profile, set.hash)).files[0].data.length, files[0].data.length);
  assert.equal(downloads, originalNames.length + 1);
  const latest = await save("new progress");
  const published = await publishProfile({ client: reopened, profile, local: latest, base: set.hash, baseTips: parents });
  assert.equal(published.head.active, latest.hash);
  assert.deepEqual([...server.files.keys()].slice(0, originalNames.length), originalNames);
  const oldest = await readNode(server, first);
  assert.deepEqual(oldest.set.files[0].data, files[0].data);
  assert.equal(oldest.set.files[0].modifiedAt, 1);
});

test("a changed Dropbox revision cannot reuse verified bytes or historical metadata", async () => {
  const server = fakeNativeStorage(), original = await save("verified"), latest = await save("newer");
  const parent = await makeSnapshot(original);
  const tip = await makeSnapshot(latest, [parent.id]);
  await writeSnapshot(server, parent);
  await writeSnapshot(server, tip);
  const records = new Map();
  const cache = { load: (id, revision) => records.get(id)?.revision === revision ? records.get(id) : undefined,
    save: (node) => records.set(node.id, node) };
  const client = await createSaveCollection(server, cache);
  const name = `${tip.id}.zip`;
  const archived = server.files.get(name);
  server.files.set(name, new Blob(["damaged revision"]));
  assert.equal(await client.refresh(), true);
  assert.equal(client.hasDamagedArchives(), true);
  assert.equal((await client.verifiedFallbacks().next()).value.hash, original.hash);
  await assert.rejects(publishProfile({ client, profile: tip.profile, local: latest }), /could not be verified/);
  assert.equal((await createSaveCollection(server, cache)).hasDamagedArchives(), true);
  server.files.set(name, archived);
  assert.equal(await client.refresh(), true);
  assert.equal(client.hasDamagedArchives(), false);
  assert.equal((await client.snapshot(tip.profile, latest.hash)).hash, latest.hash);
});
for (const afterCommit of [false, true]) test(`interrupted upload resumes ${afterCommit ? "after" : "before"} durable remote commit`, async () => {
  const server = fakeNativeStorage(), set = await save("latest");
  if (afterCommit) server.failAfterUpload = true; else server.offline = true;
  await assert.rejects(publish(server, set));
  server.offline = false;
  const result = await publish(server, set);
  assert.equal(result.head.active, set.hash); assert.equal(server.files.size, 1);
});
test("independent writers join every observed tip automatically and retain both histories", async () => {
  const server = fakeNativeStorage(), base = await save("base");
  const initial = await publish(server, base);
  const left = await save("left"), right = await save("right"), profile = await saveProfileId(base);
  right.files.forEach((file) => { file.modifiedAt = 200; });
  await publish(server, left, { base: base.hash, baseTips: initial.head.tips });
  const result = await publish(server, right, { base: base.hash, baseTips: initial.head.tips });
  assert.equal(result.action, "download"); assert.equal(result.head.concurrent, false);
  assert.equal(result.head.active, right.hash);
  assert.ok(result.head.alternatives.includes(left.hash));
  const collection = await createSaveCollection(server);
  assert.equal((await collection.snapshot(profile, left.hash)).hash, left.hash);
});

test("save-time preference is bound to immutable snapshot identity", async () => {
  const first = await save("same bytes"), second = structuredClone(first);
  second.files[0].modifiedAt = 200;
  assert.equal(first.hash, second.hash);
  assert.notEqual((await makeSnapshot(first)).id, (await makeSnapshot(second)).id);
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

test("player capture retains an unlisted save sharing a skip-intro filename", () => {
  const key = saveIndexKey("", "sky");
  const index = JSON.stringify({ pending: [], saves: [{ name: "SKY-VM.001" }] });
  const original = bytes("original user progress, not a bundled checkpoint");
  const player = { location: { href: "https://example.test/scummvm.html?hostPlayer=1&catalogSaveTarget=sky" },
    __scummwebSaveStatus: { target: "sky" }, localStorage: { getItem: (name) => name === key ? index : null },
    FS: { readdir: () => [".", "..", "SKY-VM.000", "SKY-VM.001", "SKY-VM.SAV"],
      lstat: () => ({ mode: 1, size: original.length, mtime: 100 }), isDir: () => false, isFile: () => true,
      readFile: (path) => path.endsWith(".000") ? original : bytes(path) } };
  const captured = capturePlayerSaveSet(player, { displayTitle: "Sky", skipIntro: { saveFiles: ["SKY-VM.000"] } });
  assert.deepEqual(captured.files.map(({ path }) => path), ["SKY-VM.000", "SKY-VM.001", "SKY-VM.SAV"]);
  assert.deepEqual(captured.files[0].data, original);
});

test("native cloud bookkeeping does not create a shared save profile during migration", async () => {
  const storage = browserSaveStorage({ "SKY-VM.001": bytes("progress"), timestamps: bytes("native metadata") });
  const destinations = await getSaveDestinations([{ target: "sky", displayTitle: "Sky" }], []);
  const { sets } = await getActiveSaveSets(storage, destinations);
  assert.equal(sets.length, 1);
  assert.deepEqual(sets[0].files.map(({ path }) => path), ["SKY-VM.001"]);
});
