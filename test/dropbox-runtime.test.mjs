import assert from "node:assert/strict";
import test from "node:test";
import { connectionKey, sessionKey } from "../app/dropbox/client.mjs";
import { captureFilesystem, initializeSaveEdition } from "../app/save-backups/filesystem.mjs";
import { createSaveCollection, makeSnapshot, publishProfile, saveProfileId, writeSnapshot } from "../app/dropbox/protocol.mjs";
import { syncStore } from "../app/dropbox/store.mjs";
import { applyImport, getActiveSaveSets, getSaveDestinations, identifySet, preserveSets, readStoredSets } from "../app/save-backups/backups.mjs";
import { browserSaveStorage, fakeNativeStorage, nativeCloudBrowser, indexedDbFixture, memoryStorage } from "./helpers/dropbox-fixtures.mjs";

const bytes = (text) => new TextEncoder().encode(text);
const account = "dbid:synthetic-account";
const key = (kind, profile) => `${account}/saves-v1/${kind}/${profile}`;
async function setup(t, contents = "browser progress", catalog = [{ target: "sky", displayTitle: "Beneath a Steel Sky" }]) {
  const original = new Map(["window", "document", "localStorage", "sessionStorage", "indexedDB", "navigator", "fetch", "location"]
    .map((name) => [name, Object.getOwnPropertyDescriptor(globalThis, name)]));
  const storage = browserSaveStorage(contents === null ? {} : { "SKY-VM.001": bytes(contents) });
  const sessions = memoryStorage(), idb = indexedDbFixture(), server = fakeNativeStorage();
  const locks = { busy: false, async request(name, options, run) { if (typeof options === "function") run = options; return run(this.editionBusy === name || this.busy && name === "scummweb-saves" && !(this.busy === "shared" && options.mode === "shared") ? null : { name }); } };
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
  let changes = 0;
  window.addEventListener("scummweb:saves-changed", () => { changes++; });
  const set = { destination: destinations[0], files: [{ path: "SKY-VM.001", data: bytes("from another device"), modifiedAt: 100 }] };
  set.hash = await identifySet(set);
  await publishProfile({ client: await createSaveCollection(server), profile: await saveProfileId(set), local: set });
  await runtime.syncDropbox({ beforeLaunch: true });
  assert.equal((await getActiveSaveSets(storage, destinations)).sets[0].hash, set.hash);
  await runtime.syncDropbox({ beforeLaunch: true });
  assert.equal(changes, 1, "an actual restore notifies the library once");
});

test("idle synchronization checks the collection twice rather than once per saved game", async (t) => {
  const catalog = ["sky", "queen", "lure"].map((target) => ({ target, displayTitle: target }));
  const { runtime, server, destinations } = await setup(t, null, catalog);
  const client = await createSaveCollection(server);
  for (const destination of destinations.filter(({ family }) => family !== "shared")) {
    const set = { destination: { ...destination, isolated: true },
      files: [{ path: `${destination.family}.001`, data: bytes(destination.family), modifiedAt: 100 }] };
    set.hash = await identifySet(set);
    await publishProfile({ client, profile: await saveProfileId(set), local: set });
  }
  await runtime.syncDropbox({ beforeLaunch: true });
  let listings = 0;
  const list = server.list.bind(server), uploads = server.uploads;
  server.list = () => { listings++; return list(); };
  const idleStates = [];
  const unsubscribe = runtime.subscribeDropbox(() => idleStates.push(structuredClone(runtime.getDropboxState())));
  await runtime.syncDropbox({ beforeLaunch: true });
  unsubscribe();
  assert.equal(listings, 2, "fresh start and final checks cover the whole collection");
  assert.equal(server.uploads, uploads, "an idle check must not publish more history");
  assert.equal(runtime.getDropboxState().phase, "connected");
  assert.ok(idleStates.length > 0);
  assert.ok(idleStates.some(({ checking }) => checking), "the check still runs");
  assert.ok(idleStates.every(({ phase, transferProgress, verified }) => phase === "connected" && !transferProgress && verified),
    "metadata-only checks must not paint a transfer or lose their verified status");
});

test("a quiet connected label does not release the launch gate before metadata checking finishes", async (t) => {
  const { runtime, server } = await setup(t);
  await runtime.syncDropbox({ beforeLaunch: true });
  let release, started;
  const listed = new Promise((resolve) => { started = resolve; });
  const gate = new Promise((resolve) => { release = resolve; });
  const list = server.list.bind(server);
  server.list = async () => { started(); await gate; return list(); };
  let finished = false;
  const launch = runtime.syncDropbox({ beforeLaunch: true }).then(() => { finished = true; });
  await listed;
  assert.equal(runtime.getDropboxState().phase, "connected");
  assert.equal(runtime.getDropboxState().checking, true);
  assert.equal(finished, false, "launch must await the safety check despite the quiet label");
  release(); await launch;
  assert.equal(runtime.getDropboxState().checking, false);
});

test("a failed metadata check surfaces an error without pretending it was transferring", async (t) => {
  const { runtime, server } = await setup(t);
  await runtime.syncDropbox();
  const phases = [];
  const unsubscribe = runtime.subscribeDropbox(() => phases.push(runtime.getDropboxState().phase));
  server.offline = true;
  await runtime.syncDropbox(); unsubscribe();
  assert.equal(phases.includes("syncing"), false);
  assert.equal(runtime.getDropboxState().phase, "waiting");
  assert.equal(runtime.getDropboxState().verified, false);
  assert.equal(runtime.getDropboxState().transferProgress, null);
  assert.ok(runtime.getDropboxState().message);
});

test("new completed saves show preparation, actual upload and verification before connected", async (t) => {
  const { runtime, storage, destinations, server } = await setup(t);
  await runtime.syncDropbox();
  const base = (await getActiveSaveSets(storage, destinations)).sets[0];
  const latest = { ...base, files: base.files.map((file) => ({ ...file, data: bytes("new completed save") })) };
  latest.hash = await identifySet(latest);
  const states = [], atUpload = [];
  const unsubscribe = runtime.subscribeDropbox(() => states.push(structuredClone(runtime.getDropboxState())));
  server.onUpload = () => atUpload.push(structuredClone(runtime.getDropboxState()));
  await runtime.queuePlayerSave(latest); await runtime.syncDropbox(); unsubscribe();
  assert.ok(states.some(({ phase }) => phase === "preparing"));
  assert.equal(atUpload.length, 1);
  assert.equal(atUpload[0].phase, "syncing");
  assert.equal(atUpload[0].transferProgress.stage, "upload");
  assert.equal(atUpload[0].transferProgress.direction, "upload");
  assert.equal(atUpload[0].transferProgress.percentage, 0);
  assert.equal(atUpload[0].transferProgress.title, latest.destination.title);
  assert.ok(states.some(({ transferProgress }) => transferProgress?.stage === "verify" && transferProgress.direction === "upload"));
  assert.equal(runtime.getDropboxState().phase, "connected");
  assert.equal(runtime.getDropboxState().transferProgress, null);
  assert.equal(runtime.getDropboxState().verified, true);
  assert.equal((await getActiveSaveSets(storage, destinations)).sets[0].hash, latest.hash);
});

test("restoring cached cloud bytes still exposes actual local restoration progress", async (t) => {
  const { runtime, storage, destinations, server } = await setup(t, null);
  const set = { destination: destinations[0], files: [{ path: "SKY-VM.001", data: bytes("cached cloud progress"), modifiedAt: 100 }] };
  set.hash = await identifySet(set);
  const node = await makeSnapshot(set); await writeSnapshot(server, node);
  await syncStore.put({ id: key("node", node.id), node });
  const states = [];
  const unsubscribe = runtime.subscribeDropbox(() => states.push(structuredClone(runtime.getDropboxState())));
  await runtime.syncDropbox({ beforeLaunch: true }); unsubscribe();
  assert.ok(states.some(({ phase, transferProgress }) => phase === "syncing" && transferProgress?.stage === "restore"));
  assert.equal((await getActiveSaveSets(storage, destinations)).sets[0].hash, set.hash);
  assert.equal(runtime.getDropboxState().verified, true);
});

test("native byte progress updates the row without acknowledging uploads or accepting stale messages", async (t) => {
  const { runtime, storage, destinations, server } = await setup(t);
  await runtime.syncDropbox();
  const base = (await getActiveSaveSets(storage, destinations)).sets[0];
  const latest = { ...base, files: base.files.map(file => ({ ...file, data: bytes("new measured progress") })) };
  latest.hash = await identifySet(latest);
  await runtime.queuePlayerSave(latest);
  let release, entered, emitLate;
  const gate = new Promise(resolve => { release = resolve; });
  const started = new Promise(resolve => { entered = resolve; });
  const uploads = server.uploads;
  server.onRequest = async (request, emit) => {
    if (request.op !== "upload") return;
    emitLate = emit;
    emit({ op: "progress", loaded: Math.floor(request.bytes.length * .84), total: request.bytes.length, config: "must not be persisted" });
    const percentage = runtime.getDropboxState().transferProgress.percentage;
    emit({ op: "progress", id: request.id + 1000, loaded: request.bytes.length, total: request.bytes.length });
    emit({ op: "progress", loaded: -1, total: request.bytes.length });
    emit({ op: "progress", loaded: request.bytes.length + 1, total: request.bytes.length });
    assert.equal(runtime.getDropboxState().transferProgress.percentage, percentage);
    entered(); await gate;
  };
  const flight = runtime.syncDropbox(); await started;
  try {
    const state = runtime.getDropboxState();
    assert.ok(state.transferProgress.percentage >= 41 && state.transferProgress.percentage <= 42);
    assert.equal(state.transferProgress.title, latest.destination.title);
    assert.equal(state.transferProgress.direction, "upload");
    assert.equal(state.verified, false);
    assert.equal(server.uploads, uploads, "a progress event must never count as an upload reply");
    assert.ok((await syncStore.all(key("pending", ""))).some(record => record.set.hash === latest.hash));
    assert.notEqual((await syncStore.get("native/dropbox/" + account)).config, "must not be persisted");
  } finally { release(); }
  await flight;
  assert.equal(runtime.getDropboxState().phase, "connected");
  emitLate({ op: "progress", loaded: 42, total: 100 });
  assert.equal(runtime.getDropboxState().transferProgress, null);
});

test("a remote arrival at the final collection check is restored before launch", async (t) => {
  const { runtime, storage, destinations, server } = await setup(t);
  await runtime.syncDropbox({ beforeLaunch: true });
  const base = (await getActiveSaveSets(storage, destinations)).sets[0], profile = await saveProfileId(base);
  const baseline = await syncStore.get(key("base", profile));
  const remote = { ...base, files: base.files.map((file) => ({ ...file, data: bytes("late remote progress") })) };
  remote.hash = await identifySet(remote);
  const node = await makeSnapshot(remote, baseline.tips), staged = fakeNativeStorage();
  await writeSnapshot(staged, node);
  let listings = 0;
  const list = server.list.bind(server);
  server.list = () => {
    if (++listings === 2) server.files.set(`${node.id}.zip`, staged.files.get(`${node.id}.zip`));
    return list();
  };
  await runtime.syncDropbox({ beforeLaunch: true });
  assert.equal((await getActiveSaveSets(storage, destinations)).sets[0].hash, remote.hash);
  assert.equal(runtime.getDropboxState().phase, "connected");
  assert.equal(await syncStore.get(key("pending", profile)), undefined);
});

test("a completed save arriving at the final check is drained before launch", async (t) => {
  const { runtime, storage, destinations, server } = await setup(t);
  await runtime.syncDropbox({ beforeLaunch: true });
  const base = (await getActiveSaveSets(storage, destinations)).sets[0], profile = await saveProfileId(base);
  const latest = { ...base, files: base.files.map((file) => ({ ...file, data: bytes("latest durable completed save") })) };
  latest.hash = await identifySet(latest);
  let listings = 0;
  const list = server.list.bind(server);
  server.list = async () => {
    if (++listings === 2) await syncStore.put({ id: key("pending", profile), set: latest, profile });
    return list();
  };
  await runtime.syncDropbox({ beforeLaunch: true });
  assert.equal((await getActiveSaveSets(storage, destinations)).sets[0].hash, latest.hash);
  assert.equal(runtime.getDropboxState().phase, "connected");
  assert.equal(await syncStore.get(key("pending", profile)), undefined);
});

test("continuous remote changes bound immediate recovery and leave a safe retry", async (t) => {
  const { runtime, storage, destinations, server } = await setup(t);
  await runtime.syncDropbox({ beforeLaunch: true });
  const base = (await getActiveSaveSets(storage, destinations)).sets[0], profile = await saveProfileId(base);
  let parents = (await syncStore.get(key("base", profile))).tips;
  const arrivals = [], staged = fakeNativeStorage();
  for (let index = 0; index < 3; index++) {
    const set = { ...base, files: base.files.map((file) => ({ ...file, data: bytes(`remote revision ${index}`) })) };
    set.hash = await identifySet(set);
    const node = await makeSnapshot(set, parents);
    await writeSnapshot(staged, node);
    arrivals.push(node); parents = [node.id];
  }
  let listings = 0;
  const list = server.list.bind(server);
  server.list = () => {
    if (++listings % 2 === 0 && arrivals.length) {
      const node = arrivals.shift(); server.files.set(`${node.id}.zip`, staged.files.get(`${node.id}.zip`));
    }
    return list();
  };
  await assert.rejects(runtime.syncDropbox({ beforeLaunch: true }), /Cloud saves changed/);
  assert.equal(listings, 6, "three complete attempts must not become an unbounded launch loop");
  assert.equal(runtime.getDropboxState().phase, "waiting");
  await runtime.syncDropbox({ beforeLaunch: true });
  assert.equal(runtime.getDropboxState().phase, "connected");
  assert.equal(new TextDecoder().decode((await getActiveSaveSets(storage, destinations)).sets[0].files[0].data), "remote revision 2");
});

test("first sync merges compatible local and cloud slots and acknowledges only the restored union", async (t) => {
  const { runtime, storage, destinations, server } = await setup(t);
  const local = (await getActiveSaveSets(storage, destinations)).sets[0];
  const remote = { ...local, files: [{ path: "SKY-VM.002", data: bytes("cloud slot"), modifiedAt: 200 }] };
  remote.hash = await identifySet(remote);
  await publishProfile({ client: await createSaveCollection(server), profile: await saveProfileId(remote), local: remote });
  await runtime.syncDropbox({ beforeLaunch: true });
  assert.equal(runtime.getDropboxState().phase, "connected");
  assert.equal(runtime.getDropboxState().conflicts.length, 0);
  const merged = (await getActiveSaveSets(storage, destinations)).sets[0], profile = await saveProfileId(merged);
  assert.deepEqual(merged.files.map(({ path }) => path).sort(), ["SKY-VM.001", "SKY-VM.002"]);
  assert.equal((await syncStore.get(key("base", profile))).hash, merged.hash);
  assert.equal(await syncStore.get(key("pending", profile)), undefined);
  await runtime.syncDropbox({ beforeLaunch: true });
  assert.equal(runtime.getDropboxState().phase, "connected");
  assert.equal((await getActiveSaveSets(storage, destinations)).sets[0].hash, merged.hash);
});

test("a killed first-sync merge restores its verified result without a baseline or a false conflict", async (t) => {
  const { runtime, storage, destinations, server } = await setup(t);
  const local = (await getActiveSaveSets(storage, destinations)).sets[0];
  const remote = { ...local, files: [{ path: "SKY-VM.002", data: bytes("cloud slot"), modifiedAt: 200 }] };
  remote.hash = await identifySet(remote);
  await publishProfile({ client: await createSaveCollection(server), profile: await saveProfileId(remote), local: remote });
  const merged = { ...local, files: [...local.files, ...remote.files] };
  merged.hash = await identifySet(merged);
  server.onUpload = () => {
    if (server.files.size === 3) { server.onUpload = null; server.failAfterUpload = true; }
  };
  await runtime.syncDropbox();
  assert.equal(runtime.getDropboxState().phase, "waiting");
  assert.equal((await getActiveSaveSets(storage, destinations)).sets[0].hash, local.hash);
  const restarted = await import(`../app/dropbox/runtime.mjs?merged-reply=${crypto.randomUUID()}`);
  await restarted.syncDropbox({ beforeLaunch: true });
  assert.equal(restarted.getDropboxState().phase, "connected");
  assert.equal((await getActiveSaveSets(storage, destinations)).sets[0].hash, merged.hash);
  assert.equal(server.files.size, 3);
});

test("unknown cloud editions stay preserved until their matching game is available", async (t) => {
  const { runtime, storage, destinations, server } = await setup(t, null);
  let changes = 0;
  window.addEventListener("scummweb:saves-changed", () => { changes++; });
  storage.removeItem("/");
  const fetcher = globalThis.fetch;
  globalThis.fetch = (url, ...args) => {
    assert.notEqual(url, "/scummvm.ini", "preservation must not initialize an unavailable edition");
    return fetcher(url, ...args);
  };
  const namespace = "version-" + "c".repeat(64);
  const set = { destination: { key: namespace, namespace, title: "Missing edition", fingerprint: "f".repeat(64) },
    files: [{ path: "game.001", data: bytes("preserve"), modifiedAt: 100 }] };
  set.hash = await identifySet(set);
  await publishProfile({ client: await createSaveCollection(server), profile: await saveProfileId(set), local: set });
  await runtime.syncDropbox({ beforeLaunch: true });
  assert.equal((await getActiveSaveSets(storage, destinations)).sets.length, 0);
  assert.ok((await readStoredSets()).some(({ hash }) => hash === set.hash));
  await runtime.syncDropbox({ beforeLaunch: true });
  assert.equal(changes, 0, "preserving an unavailable edition must not trigger another sync pass");
  assert.equal(storage.getItem("/"), null);
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
  try {
    assert.equal(runtime.getDropboxState().phase, "connected");
    assert.equal(runtime.getDropboxState().checking, true);
    assert.equal(runtime.getDropboxState().verified, false);
    assert.equal(runtime.getDropboxState().transferProgress, null);
    assert.equal(server.uploads, 0);
  } finally { release(); }
  await launch;
  assert.equal(runtime.getDropboxState().phase, "connected");
});

test("an incomplete save explains its actual blocker instead of asking to exit a nonexistent game", async (t) => {
  const { runtime, storage } = await setup(t);
  storage.setItem("scummweb.continue.v1:synthetic", JSON.stringify({ pending: ["SKY-VM.001"] }));
  await runtime.syncDropbox();
  assert.equal(runtime.getDropboxState().phase, "waiting");
  assert.match(runtime.getDropboxState().message, /incomplete game save/);
  assert.doesNotMatch(runtime.getDropboxState().message, /exit the game/);
});


test("overlapping first-sync progress resolves automatically and keeps both complete originals", async (t) => {
  const { runtime, storage, destinations, server } = await setup(t);
  const local = (await getActiveSaveSets(storage, destinations)).sets[0];
  const remote = { ...local, files: local.files.map((file) => ({ ...file, data: bytes("newer remote progress"), modifiedAt: 200 })) };
  remote.hash = await identifySet(remote);
  await writeSnapshot(server, await makeSnapshot(remote));
  await runtime.syncDropbox({ beforeLaunch: true });
  assert.equal(runtime.getDropboxState().phase, "connected");
  assert.equal(runtime.getDropboxState().conflicts.length, 0);
  assert.equal((await getActiveSaveSets(storage, destinations)).sets[0].hash, remote.hash);
  const preserved = await readStoredSets();
  assert.ok([local, remote].every((set) => preserved.some(({ hash }) => hash === set.hash)));
  const uploads = server.uploads;
  await runtime.syncDropbox({ beforeLaunch: true });
  assert.equal(server.uploads, uploads, "a settled automatic decision must not republish");
});

test("an interrupted automatic choice retains local progress until restart verifies the cloud result", async (t) => {
  const { runtime, storage, destinations, server } = await setup(t);
  await runtime.syncDropbox({ beforeLaunch: true });
  const local = (await getActiveSaveSets(storage, destinations)).sets[0], profile = await saveProfileId(local);
  const base = await syncStore.get(key("base", profile));
  const branches = [];
  for (const modifiedAt of [200, 300]) {
    const set = { ...local, files: local.files.map((file) => ({ ...file, data: bytes(`remote ${modifiedAt}`), modifiedAt })) };
    set.hash = await identifySet(set); branches.push(set);
    await writeSnapshot(server, await makeSnapshot(set, base.tips));
  }
  server.failAfterUpload = true;
  await runtime.syncDropbox();
  assert.equal(runtime.getDropboxState().phase, "waiting");
  assert.equal((await getActiveSaveSets(storage, destinations)).sets[0].hash, local.hash);
  const restarted = await import(`../app/dropbox/runtime.mjs?automatic-restart=${crypto.randomUUID()}`);
  await restarted.syncDropbox({ beforeLaunch: true });
  assert.equal(restarted.getDropboxState().phase, "connected");
  assert.equal((await getActiveSaveSets(storage, destinations)).sets[0].hash, branches[1].hash);
  assert.equal(await syncStore.get(key("pending", profile)), undefined);
  const preserved = await readStoredSets();
  assert.ok(branches.every((set) => preserved.some(({ hash }) => hash === set.hash)));
});


test("a different pre-release storage layout cannot supply baselines to the saves collection", async (t) => {
  const { runtime, storage, destinations, server } = await setup(t);
  const set = (await getActiveSaveSets(storage, destinations)).sets[0], profile = await saveProfileId(set);
  const legacy = { id: `${account}/base/${profile}`, hash: "a".repeat(64), tips: ["b".repeat(64)] };
  await syncStore.put(legacy);
  await runtime.syncDropbox({ beforeLaunch: true });
  assert.equal(runtime.getDropboxState().phase, "connected");
  assert.equal((await syncStore.get(key("base", profile))).hash, set.hash);
  assert.deepEqual(await syncStore.get(legacy.id), legacy, "other layouts remain untouched");
  assert.ok(server.files.size > 0);
});
