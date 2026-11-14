import assert from "node:assert/strict";
import test from "node:test";
import { connectionKey, sessionKey } from "../app/dropbox/client.mjs";
import { createSaveCollection, publishProfile, saveProfileId } from "../app/dropbox/protocol.mjs";
import { syncStore } from "../app/dropbox/store.mjs";
import { getActiveSaveSets, getSaveDestinations, identifySet, preserveSets, readStoredSets } from "../app/save-backups/backups.mjs";
import { browserSaveStorage, fakeNativeStorage, nativeCloudBrowser, indexedDbFixture, memoryStorage } from "./helpers/dropbox-fixtures.mjs";

const bytes = (text) => new TextEncoder().encode(text);
const account = "dbid:synthetic-account";
const key = (kind, profile) => `${account}/${kind}/${profile}`;
async function setup(t, contents = "browser progress", catalog = [{ target: "sky", displayTitle: "Beneath a Steel Sky" }]) {
  const original = new Map(["window", "document", "localStorage", "sessionStorage", "indexedDB", "navigator", "fetch", "location"]
    .map((name) => [name, Object.getOwnPropertyDescriptor(globalThis, name)]));
  const storage = browserSaveStorage(contents === null ? {} : { "SKY-VM.001": bytes(contents) });
  const sessions = memoryStorage(), idb = indexedDbFixture(), server = fakeNativeStorage();
  const locks = { busy: false, async request(name, options, run) { if (typeof options === "function") run = options; return run(this.busy && name === "scummweb-saves" ? null : { name }); } };
  const browser = nativeCloudBrowser(server, storage);
  const globals = { window: browser.window, document: browser.document, location: browser.location, localStorage: storage, sessionStorage: sessions, indexedDB: idb, navigator: { locks },
    fetch: async (url) => url === "/games.json" ? Response.json({ games: catalog })
      : new Response("[scummvm]\n") };
  for (const [name, value] of Object.entries(globals)) Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
  storage.setItem(connectionKey, JSON.stringify({ enabled: true, accountId: account }));
  sessions.setItem(sessionKey, JSON.stringify({ token: "synthetic-token", accountId: account, expiresAt: Date.now() + 3600000 }));
  t.after(() => { for (const [name, descriptor] of original) {
    if (descriptor) Object.defineProperty(globalThis, name, descriptor); else delete globalThis[name];
  } });
  await syncStore.put({ id: "native/dropbox/" + account, config: "[cloud]\ncurrent_storage=1\n" });
  const runtime = await import(`../app/dropbox/runtime.mjs?test=${crypto.randomUUID()}`);
  const destinations = await getSaveDestinations(catalog, []);
  return { storage, sessions, idb, server, locks, runtime, destinations };
}

test("first connection migrates active AND preserved browser saves without deleting the originals", async (t) => {
  const { storage, runtime, destinations, idb } = await setup(t);
  const before = new Map(storage.values);
  const preserved = { ...(await getActiveSaveSets(storage, destinations)).sets[0], files: [{ path: "SKY-VM.002", data: bytes("old preserved"), modifiedAt: 90 }] };
  preserved.hash = await identifySet(preserved);
  await preserveSets([preserved]);
  await runtime.syncDropbox({ beforeLaunch: true });
  assert.equal(runtime.getDropboxState().phase, "connected");
  assert.deepEqual(storage.values, before);
  assert.ok((await readStoredSets()).some(({ hash }) => hash === preserved.hash));
  assert.ok(idb.durability.filter(({ name, mode }) => name === "scummweb.dropbox-sync" && mode === "readwrite")
    .every(({ durability }) => durability === "strict"));
});

test("offline native saves survive a new coordinator instance and resume without an exit handler", async (t) => {
  const { runtime, storage, destinations, server, locks } = await setup(t);
  await runtime.syncDropbox({ beforeLaunch: true });
  const old = (await getActiveSaveSets(storage, destinations)).sets[0];
  const latest = { ...old, files: [{ path: "SKY-VM.001", data: bytes("latest completed bytes"), modifiedAt: 200 }] };
  latest.hash = await identifySet(latest);
  server.offline = true; locks.busy = true;
  await runtime.queuePlayerSave(latest);
  await runtime.syncDropbox();
  const profile = await saveProfileId(latest);
  assert.equal((await syncStore.get(key("pending", profile))).set.hash, latest.hash);
  // Simulate kill/reopen: transient state disappears; durable storage remains.
  // BrowserFS intentionally still holds the OLD bytes to test independent flushes.
  server.offline = false; locks.busy = false;
  const restarted = await import(`../app/dropbox/runtime.mjs?restart=${crypto.randomUUID()}`);
  await restarted.syncDropbox({ beforeLaunch: true });
  assert.equal(restarted.getDropboxState().phase, "connected");
  assert.equal((await getActiveSaveSets(storage, destinations)).sets[0].hash, latest.hash);
  assert.equal(await syncStore.get(key("pending", profile)), undefined);
});

test("lost upload success replies retain the outbox until restart verifies publication", async (t) => {
  const { runtime, storage, destinations, server } = await setup(t);
  server.failAfterUpload = true;
  await runtime.syncDropbox();
  assert.equal(runtime.getDropboxState().phase, "waiting");
  const set = (await getActiveSaveSets(storage, destinations)).sets[0], profile = await saveProfileId(set);
  assert.ok(await syncStore.get(key("pending", profile)));
  const restarted = await import(`../app/dropbox/runtime.mjs?restart=${crypto.randomUUID()}`);
  await restarted.syncDropbox({ beforeLaunch: true });
  assert.equal(await syncStore.get(key("pending", profile)), undefined);
  assert.equal(restarted.getDropboxState().phase, "connected");
});

test("a clean browser restores cloud progress before the launch gate completes", async (t) => {
  const { runtime, storage, destinations, server } = await setup(t, null);
  const set = { destination: destinations[0], files: [{ path: "SKY-VM.001", data: bytes("from another device"), modifiedAt: 100 }] };
  set.hash = await identifySet(set);
  await publishProfile({ client: await createSaveCollection(server), profile: await saveProfileId(set), local: set });
  await runtime.syncDropbox({ beforeLaunch: true });
  assert.equal((await getActiveSaveSets(storage, destinations)).sets[0].hash, set.hash);
});

test("unknown cloud editions stay preserved until their matching game is available", async (t) => {
  const { runtime, storage, destinations, server } = await setup(t, null);
  const namespace = "version-" + "c".repeat(64);
  const set = { destination: { key: namespace, namespace, title: "Missing edition", fingerprint: "f".repeat(64) },
    files: [{ path: "game.001", data: bytes("preserve"), modifiedAt: 100 }] };
  set.hash = await identifySet(set);
  await publishProfile({ client: await createSaveCollection(server), profile: await saveProfileId(set), local: set });
  await runtime.syncDropbox({ beforeLaunch: true });
  assert.equal((await getActiveSaveSets(storage, destinations)).sets.length, 0);
  assert.ok((await readStoredSets()).some(({ hash }) => hash === set.hash));
});

test("cloud changes never replace a running player's working copy", async (t) => {
  const { runtime, storage, destinations, server, locks } = await setup(t);
  await runtime.syncDropbox({ beforeLaunch: true });
  const base = (await getActiveSaveSets(storage, destinations)).sets[0];
  const remote = { ...base, files: [{ path: "SKY-VM.001", data: bytes("remote"), modifiedAt: 200 }] };
  remote.hash = await identifySet(remote);
  await publishProfile({ client: await createSaveCollection(server), profile: await saveProfileId(base), local: remote, base: base.hash, baseTips: (await createSaveCollection(server)).head(await saveProfileId(base)).tips });
  locks.busy = true;
  await runtime.syncDropbox();
  assert.equal((await getActiveSaveSets(storage, destinations)).sets[0].hash, base.hash);
  assert.equal(runtime.getDropboxState().phase, "waiting");
  locks.busy = false;
  await runtime.syncDropbox({ beforeLaunch: true });
  assert.equal((await getActiveSaveSets(storage, destinations)).sets[0].hash, remote.hash);
});

test("disconnect during upload prevents subsequent cloud writes and local restore", async (t) => {
  const { runtime, storage, server } = await setup(t);
  const before = new Map(storage.values);
  server.onUpload = () => { void runtime.disconnectDropbox(); };
  await runtime.syncDropbox();
  assert.equal(runtime.getDropboxState().phase, "disconnected");
  assert.equal(server.uploads, 1);
  assert.equal(storage.getItem("/"), before.get("/"));
});

test("missing persisted native credentials require reconnect without cloud writes", async (t) => {
  const { runtime, sessions, server } = await setup(t);
  await syncStore.remove("native/dropbox/" + account);
  await assert.rejects(runtime.syncDropbox({ beforeLaunch: true }), /Reconnect Dropbox/);
  assert.equal(server.uploads, 0);
  assert.equal(runtime.getDropboxState().phase, "reconnect");
});

test("acknowledgements cannot remove a newer pending save or recreate disconnected credentials", async (t) => {
  await setup(t);
  const id = key("pending", "synthetic-profile");
  await syncStore.put({ id, set: { hash: "newer" } });
  await syncStore.removeIf(id, (record) => record.set.hash === "older");
  assert.equal((await syncStore.get(id)).set.hash, "newer");
  const credential = "native/dropbox/" + account;
  await syncStore.put({ id: credential, connectionId: "new", config: "new" });
  await syncStore.putIf({ id: credential, connectionId: "old", config: "old" }, (current) => current.connectionId === "old");
  assert.equal((await syncStore.get(credential)).config, "new");
  await syncStore.remove(credential);
  await syncStore.putIf({ id: credential, config: "old" }, () => true);
  assert.equal(await syncStore.get(credential), undefined);
});

for (const stage of ["startup", "transfer"]) test(`native ${stage} timeout leaves a retryable status instead of a stuck syncing control`, async (t) => {
  const { runtime } = await setup(t);
  const originalTimer = globalThis.setTimeout;
  globalThis.setTimeout = (callback, delay, ...args) => originalTimer(callback, [90000, 120000].includes(delay) ? 10 : delay, ...args);
  t.after(() => { globalThis.setTimeout = originalTimer; });
  if (stage === "startup") document.body.append = () => {};
  else {
    const create = document.createElement;
    document.createElement = (...args) => {
      const frame = create(...args), send = frame.contentWindow.postMessage;
      frame.contentWindow.postMessage = (message, ...rest) => { if (message.op !== "list") send(message, ...rest); };
      return frame;
    };
  }
  await runtime.syncDropbox();
  assert.equal(runtime.getDropboxState().phase, "waiting");
  assert.match(runtime.getDropboxState().message, /start save sync|timed out/);
});

function fastImportObservation(t) {
  const timer = globalThis.setTimeout;
  globalThis.setTimeout = (callback, delay, ...args) => timer(callback, delay === 2000 ? 1 : delay, ...args);
  t.after(() => { globalThis.setTimeout = timer; });
}
function copyBass(server, contents = "copied ScummVM progress") {
  server.imports.set("SKY-VM.001", new Blob([contents]));
  server.imports.set("SKY-VM.SAV", new Blob(["ScummVM companion"]));
}

test("copied regular saves restore, and old inbox contents never reimport after browser reset", async (t) => {
  const { runtime, storage, destinations, server } = await setup(t, null);
  fastImportObservation(t); copyBass(server);
  await runtime.syncDropbox({ beforeLaunch: true });
  const imported = (await getActiveSaveSets(storage, destinations)).sets[0];
  assert.equal(imported.destination.isolated, true);
  assert.equal(imported.files.length, 2);
  assert.equal(new TextDecoder().decode(imported.files.find((file) => file.path === "SKY-VM.001").data), "copied ScummVM progress");
  const newer = { ...imported, files: imported.files.map((file) => file.path === "SKY-VM.001" ? { ...file, data: bytes("newer cloud progress") } : file) };
  newer.hash = await identifySet(newer);
  const client = await createSaveCollection(server), profile = await saveProfileId(imported);
  await publishProfile({ client, profile, local: newer, base: imported.hash, baseTips: client.head(profile).tips });
  storage.removeItem("/");
  for (const record of await syncStore.all(account + "/")) await syncStore.remove(record.id);
  const restarted = await import(`../app/dropbox/runtime.mjs?loose-restart=${crypto.randomUUID()}`);
  await restarted.syncDropbox({ beforeLaunch: true });
  assert.equal((await getActiveSaveSets(storage, destinations)).sets[0].hash, newer.hash);
  assert.equal(server.files.size, 2);
  assert.equal(server.imports.size, 2);
});

test("copied progress conflicting with browser progress requires a choice and keeps both copies", async (t) => {
  const { runtime, storage, destinations, server } = await setup(t);
  fastImportObservation(t);
  await runtime.syncDropbox({ beforeLaunch: true });
  const original = (await getActiveSaveSets(storage, destinations)).sets[0];
  copyBass(server);
  await runtime.syncDropbox();
  assert.equal(runtime.getDropboxState().phase, "conflict");
  assert.equal((await getActiveSaveSets(storage, destinations)).sets[0].hash, original.hash);
  const conflict = runtime.getDropboxState().conflicts[0];
  const choice = conflict.local.hash === original.hash ? "remote" : "local";
  await runtime.resolveDropboxConflict(conflict.profile, choice);
  assert.equal(runtime.getDropboxState().phase, "connected");
  assert.notEqual((await getActiveSaveSets(storage, destinations)).sets[0].hash, original.hash);
  assert.ok((await readStoredSets()).some((set) => set.hash === original.hash));
  await runtime.syncDropbox({ beforeLaunch: true });
  assert.equal(runtime.getDropboxState().phase, "connected");
});

for (const existingProgress of [false, true]) test(`an unrelated conflict permits a fully synced game ${existingProgress ? "with cloud progress" : "without saves"}`, async (t) => {
  const catalog = [{ target: "sky", displayTitle: "Beneath a Steel Sky" },
    { target: "neverhood-demo", displayTitle: "The Neverhood (Demo)" }];
  const { runtime, storage, destinations, server, locks } = await setup(t, "browser progress", catalog);
  fastImportObservation(t);
  await runtime.syncDropbox({ beforeLaunch: true });
  const original = (await getActiveSaveSets(storage, destinations)).sets[0];
  let remote;
  if (existingProgress) {
    remote = { destination: { ...destinations.find(({ key }) => key === "catalog:neverhood-demo"), isolated: true },
      files: [{ path: "neverhood-demo.001", data: bytes("other game's progress"), modifiedAt: 100 }] };
    remote.hash = await identifySet(remote);
    await publishProfile({ client: await createSaveCollection(server), profile: await saveProfileId(remote), local: remote });
  }
  copyBass(server);
  await runtime.syncDropbox({ beforeLaunch: true, launchDestinationKey: "catalog:neverhood-demo" });
  assert.equal(runtime.getDropboxState().phase, "conflict");
  const active = (await getActiveSaveSets(storage, destinations)).sets;
  assert.ok(active.some(({ hash }) => hash === original.hash));
  if (remote) assert.ok(active.some(({ hash }) => hash === remote.hash));
  assert.equal(server.imports.size, 2);
  assert.ok((await readStoredSets()).some(({ hash }) => hash !== original.hash));
  for (const launchDestinationKey of ["catalog:sky", "catalog:unknown", null]) {
    await assert.rejects(runtime.syncDropbox({ beforeLaunch: true, launchDestinationKey }), /Choose which saved progress/);
  }
  // A busy save scan cannot establish that an unrelated edition is safe.
  locks.busy = true;
  await assert.rejects(runtime.syncDropbox({ beforeLaunch: true, launchDestinationKey: "catalog:neverhood-demo" }), /Choose which saved progress/);
  locks.busy = false;
  storage.setItem("scummweb.continue.v1:catalog-neverhood-demo", JSON.stringify({ pending: ["neverhood-demo.001"] }));
  await assert.rejects(runtime.syncDropbox({ beforeLaunch: true, launchDestinationKey: "catalog:neverhood-demo" }), /Choose which saved progress/);
  storage.removeItem("scummweb.continue.v1:catalog-neverhood-demo");
  server.offline = true;
  await assert.rejects(runtime.syncDropbox({ beforeLaunch: true, launchDestinationKey: "catalog:neverhood-demo" }));
});

test("a lost copied-save publication reply resumes without losing or duplicating the import", async (t) => {
  const { runtime, storage, destinations, server } = await setup(t, null);
  fastImportObservation(t); copyBass(server); server.failAfterUpload = true;
  await runtime.syncDropbox();
  assert.equal(runtime.getDropboxState().phase, "waiting");
  const restarted = await import(`../app/dropbox/runtime.mjs?loose-crash=${crypto.randomUUID()}`);
  await restarted.syncDropbox({ beforeLaunch: true });
  assert.equal((await getActiveSaveSets(storage, destinations)).sets[0].files.length, 2);
  assert.equal(server.files.size, 1);
});

test("a stalled coordinator releases its flight and lock, retries, and fences the late result", async (t) => {
  const { runtime, server, locks } = await setup(t);
  const timer = globalThis.setTimeout, fetcher = globalThis.fetch;
  let release;
  globalThis.setTimeout = (callback, delay, ...args) => delay === 180000
    ? timer(function expireStalledFetch() { if (release) callback(...args); else timer(expireStalledFetch, 1); }, 25)
    : timer(callback, delay, ...args);
  t.after(() => { globalThis.setTimeout = timer; });
  globalThis.fetch = () => new Promise((resolve) => { release = resolve; });
  let held = false;
  const request = locks.request.bind(locks);
  locks.request = async (name, options, run) => {
    if (name !== "scummweb-dropbox-sync") return request(name, options, run);
    if (held) return run(null);
    held = true;
    try { return await run({ name }); } finally { held = false; }
  };
  await runtime.syncDropbox();
  assert.equal(runtime.getDropboxState().phase, "waiting");
  assert.match(runtime.getDropboxState().message, /stopped responding/);
  assert.equal(held, false);
  // A stalled cached catalog must be evicted: retry before it ever resolves.
  globalThis.fetch = fetcher;
  globalThis.setTimeout = timer;
  await runtime.syncDropbox({ beforeLaunch: true });
  assert.equal(runtime.getDropboxState().phase, "connected");
  release(Response.json({ games: [{ target: "sky", displayTitle: "Beneath a Steel Sky" }] }));
  await new Promise((resolve) => timer(resolve, 10));
  assert.equal(server.files.size, 1);
});

test("returning to a visible tab retries a failed sync without reload", async (t) => {
  const { runtime, server } = await setup(t);
  server.offline = true;
  await runtime.syncDropbox();
  assert.equal(runtime.getDropboxState().phase, "waiting");
  document.hidden = true;
  const stop = runtime.startDropboxSync();
  try {
  server.offline = false;
  document.hidden = false;
  document.dispatchEvent(new Event("visibilitychange"));
  for (let attempt = 0; attempt < 100 && runtime.getDropboxState().phase !== "connected"; attempt++) {
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  assert.equal(runtime.getDropboxState().phase, "connected");
  } finally { stop(); }
});

test("unchanged copied files avoid downloads, while same-size same-time revisions are imported", async (t) => {
  const { runtime, server } = await setup(t, null);
  fastImportObservation(t); copyBass(server, "first progress");
  await runtime.syncDropbox({ beforeLaunch: true });
  const downloads = server.importDownloads;
  assert.ok(downloads > 0);
  await runtime.syncDropbox({ beforeLaunch: true });
  assert.equal(server.importDownloads, downloads);
  // Equal length and mtime are insufficient; Dropbox's revision changed.
  copyBass(server, "other progress");
  await runtime.syncDropbox();
  assert.ok(server.importDownloads > downloads);
  assert.equal(runtime.getDropboxState().phase, "conflict");
});

test("launch waits for another coordinator's lock instead of failing a healthy sync", async (t) => {
  const { runtime, locks, server } = await setup(t);
  const request = locks.request.bind(locks);
  let release;
  locks.request = async (name, options, run) => {
    if (name !== "scummweb-dropbox-sync") return request(name, options, run);
    assert.equal(options.ifAvailable, undefined);
    assert.ok(options.signal);
    await new Promise((resolve) => { release = resolve; });
    return run({ name });
  };
  const launch = runtime.syncDropbox({ beforeLaunch: true });
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.equal(runtime.getDropboxState().phase, "syncing");
  assert.equal(server.uploads, 0);
  release();
  await launch;
  assert.equal(runtime.getDropboxState().phase, "connected");
});
