import assert from "node:assert/strict";
import test from "node:test";
import { connectionKey, maxBackupBytes, sessionKey } from "../app/dropbox/client.mjs";
import { createNativeCloudClient } from "../app/cloud/native-client.mjs";
import { activityCacheKey } from "../app/game-player/activity.mjs";
import { saveGameSources } from "../app/game-sources.mjs";
import { dropboxEnabled, prepareDropboxLaunch, reportDropboxSave } from "../app/dropbox/bridge.mjs";
import { captureFilesystem, initializeSaveEdition } from "../app/save-backups/filesystem.mjs";
import { createSaveCollection, makeSnapshot, publishProfile, readNode, readSnapshot, saveProfileId, writeSnapshot } from "../app/dropbox/protocol.mjs";
import { openSaveStorage } from "../web-shell/save-storage.mjs";
import { editionKey, readSaveTree, saveLaunchBlocked, saveLockName } from "../web-shell/save-editions.mjs";
import { syncStore } from "../app/dropbox/store.mjs";
import { applyImport, getActiveSaveSets, getSaveDestinations, identifySet, preserveSets, readStoredSets } from "../app/save-backups/backups.mjs";
import { browserSaveStorage, fakeNativeStorage, nativeCloudBrowser, indexedDbFixture, memoryStorage } from "./helpers/dropbox-fixtures.mjs";

const bytes = (text) => new TextEncoder().encode(text);
const account = "dbid:synthetic-account";
const activeSets = async destinations => getActiveSaveSets(await openSaveStorage(), destinations);
const updateActive = async (key, value) => {
  const view = await openSaveStorage();
  view.setItem(key, JSON.stringify(value));
  await view.commit();
};
const key = (kind, profile) => `${account}/saves-v1/${kind}/${profile}`;
async function setup(t, contents = "browser progress", catalog = [{ target: "sky", displayTitle: "Beneath a Steel Sky" }]) {
  const original = new Map(["window", "document", "localStorage", "sessionStorage", "indexedDB", "IDBKeyRange", "navigator", "fetch", "location"]
    .map((name) => [name, Object.getOwnPropertyDescriptor(globalThis, name)]));
  const storage = browserSaveStorage(contents === null ? {} : { "SKY-VM.001": bytes(contents) });
  const sessions = memoryStorage(), idb = indexedDbFixture(), server = fakeNativeStorage();
  const locks = { busy: false, async request(name, options, run) { if (typeof options === "function") run = options; return run(this.editionBusy === name || this.busy && name === "scummweb-saves" && !(this.busy === "shared" && options.mode === "shared") ? null : { name }); } };
  const browser = nativeCloudBrowser(server, storage);
  browser.window.indexedDB = idb;
  browser.location.search = "?dropbox=true";
  const globals = { window: browser.window, document: browser.document, location: browser.location, localStorage: storage, sessionStorage: sessions, indexedDB: idb, navigator: { locks },
    IDBKeyRange: { bound: (lower, upper) => ({ lower, upper }) },
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

test("the native bridge lists more than 10,000 archived saves without downloading or pruning them", async (t) => {
  const { server } = await setup(t, null);
  const archive = new Blob(["list-only fixture"]);
  for (let index = 0; index < 10001; index++) server.files.set(`${index.toString(16).padStart(64, "0")}.zip`, archive);
  const transport = await createNativeCloudClient({ accountId: account });
  try {
    const names = await transport.list();
    assert.equal(names.length, 10001);
    assert.deepEqual(names, [...server.files.keys()]);
    assert.equal(server.uploads, 0);
  } finally { transport.close(); }
});

test("Dropbox verifies downloaded bytes when the native listing rounds their size", async (t) => {
  const { server } = await setup(t, null);
  const name = `${"a".repeat(64)}.zip`;
  const body = new Blob([new Uint8Array(1_474_402)]);
  const listed = body.slice();
  Object.defineProperty(listed, "size", { value: 1_474_400 });
  server.files.set(name, listed);
  const revision = "123456789";
  server.revision = () => revision;
  await syncStore.put({ id: "native/dropbox/" + account, config: "[cloud]\nstorage_Dropbox_access_token=synthetic\n" });
  let responseRevision = revision;
  let responseBody = body;
  let responseSize = body.size;
  globalThis.fetch = async () => new Response(responseBody, {
    headers: { "Dropbox-API-Result": JSON.stringify({ name, rev: responseRevision, size: responseSize }) },
  });

  const transport = await createNativeCloudClient({ accountId: account });
  try {
    await transport.list();
    assert.equal(transport.size(name), 1_474_400);
    assert.equal((await transport.download(name)).size, body.size);

    responseRevision = "abcdef012";
    await assert.rejects(transport.download(name), { kind: "changed" });

    responseRevision = revision;
    responseBody = body.slice(0, body.size - 1);
    await assert.rejects(transport.download(name), /incomplete save download/);

    responseSize = maxBackupBytes + 1;
    await assert.rejects(transport.download(name), /invalid save metadata/);
  } finally { transport.close(); }
});

for (const search of ["", "?other=true", "?dropbox=false", "?dropbox=1"]) {
  test(`connected accounts do not sync or block launch with URL search ${JSON.stringify(search)}`, async (t) => {
    const { storage, runtime, server, destinations } = await setup(t);
    const set = (await activeSets(destinations)).sets[0];
    await updateActive("scummweb.continue.v1:synthetic", { pending: ["SKY-VM.001"] });
    const before = new Map(storage.values);
    location.search = search;
    let requests = 0;
    server.onRequest = () => { requests++; };
    assert.equal(dropboxEnabled(), false);
    await prepareDropboxLaunch("catalog:sky");
    reportDropboxSave(new Proxy({}, { get() { assert.fail("disabled sync must not capture the player"); } }), {});
    await runtime.queuePlayerSave(set);
    await runtime.syncDropbox({ beforeLaunch: true, launchDestinationKey: "catalog:sky" });
    const stop = runtime.startDropboxSync();
    window.dispatchEvent(new Event("online"));
    window.dispatchEvent(new Event("focus"));
    window.dispatchEvent(new Event("scummweb:saves-changed"));
    stop();
    assert.equal(requests, 0);
    assert.equal(server.files.size, 0);
    assert.deepEqual(await syncStore.all(key("pending", "")), []);
    assert.deepEqual(storage.values, before, "connection and local saves are retained");
    location.search = "?dropbox=true";
    assert.equal(dropboxEnabled(), true, "the existing connection resumes only on a flagged visit");
  });
}

test("removing the URL flag cancels an active background sync without disconnecting", async (t) => {
  const { storage, runtime, server } = await setup(t);
  let started;
  const ready = new Promise((resolve) => { started = resolve; });
  server.onRequest = async () => { started(); await new Promise(() => {}); };
  const stop = runtime.startDropboxSync();
  try {
    await ready;
    const flight = runtime.syncDropbox({ beforeLaunch: true, launchDestinationKey: "catalog:sky" });
    location.search = "";
    stop();
    await flight;
  } finally { stop(); }
  assert.equal(runtime.getDropboxState().checking, false);
  assert.equal(JSON.parse(storage.getItem(connectionKey)).enabled, true);
  assert.equal(server.files.size, 0);
});

test("activity uses the scoped Dropbox session without blocking play and disconnect cancels it", async (t) => {
  const { runtime, storage } = await setup(t, null);
  await syncStore.put({ id: "native/dropbox/" + account, config: "[cloud]\nstorage_Dropbox_access_token=test-token\n" });
  const fetchCatalog = globalThis.fetch;
  let request;
  let started;
  const ready = new Promise((resolve) => { started = resolve; });
  globalThis.fetch = async (url, options) => {
    if (url === "https://content.dropboxapi.com/2/files/download") {
      request = options;
      started();
      return new Promise((_, reject) => {
        options.signal.addEventListener("abort", () => reject(options.signal.reason), { once: true });
      });
    }
    return fetchCatalog(url, options);
  };
  await runtime.syncDropbox({ beforeLaunch: true });
  await ready;
  assert.equal(runtime.getDropboxState().phase, "connected");
  assert.equal(request.headers.Authorization, "Bearer test-token");
  await runtime.disconnectDropbox();
  assert.ok(request.signal.aborted);
  assert.equal(storage.getItem(activityCacheKey), null);
});

test("first sync migrates a cold legacy library before uploading active and preserved saves", async (t) => {
  const { storage, runtime, destinations, idb, server } = await setup(t);
  const before = await getActiveSaveSets(storage, destinations);
  const preserved = { ...before.sets[0], files: [{ path: "SKY-VM.002", data: bytes("old preserved"), modifiedAt: 90 }] };
  preserved.hash = await identifySet(preserved);
  await preserveSets([preserved]);
  const originalRoot = storage.getItem("/");
  assert.ok(originalRoot, "the first sync must see the unmigrated browser filesystem");
  await runtime.syncDropbox({ beforeLaunch: true });
  assert.equal(runtime.getDropboxState().phase, "connected");
  const [active] = (await activeSets(destinations)).sets;
  assert.ok(active.files.some(file => file.path === "SKY-VM.001" && Buffer.from(file.data).equals(Buffer.from("browser progress"))));
  assert.equal(storage.getItem("/"), null);
  const [migration] = idb.databases.get("scummweb.active-saves").get("migration").values();
  assert.equal(migration.original.get("/"), originalRoot);
  assert.ok((await readStoredSets()).some(({ hash }) => hash === preserved.hash));
  const cloud = await createSaveCollection(server);
  const profile = await saveProfileId(active);
  const uploaded = await readSnapshot(cloud, profile, cloud.head(profile).active);
  assert.deepEqual(uploaded.files, active.files);
  assert.ok(idb.durability.filter(({ name, mode }) => name === "scummweb.dropbox-sync" && mode === "readwrite")
    .every(({ durability }) => durability === "strict"));
});

test("first sync restores a verified cloud slot instead of uploading a truncated legacy copy", async (t) => {
  const { storage, runtime, destinations, idb, server } = await setup(t, "long legacy save");
  const legacy = readSaveTree(storage, "");
  const { dataKey } = legacy.inode(legacy.files["SKY-VM.001"]);
  storage.setItem(dataKey, btoa("partial"));
  const verified = { destination: destinations[0],
    files: [{ path: "SKY-VM.001", data: bytes("intact cloud save"), modifiedAt: 90 }] };
  verified.hash = await identifySet(verified);
  await writeSnapshot(server, await makeSnapshot(verified));

  await runtime.syncDropbox({ beforeLaunch: true });
  assert.equal(runtime.getDropboxState().verified, true);
  assert.deepEqual((await activeSets(destinations)).sets[0].files, verified.files);
  const [migration] = idb.databases.get("scummweb.active-saves").get("migration").values();
  assert.equal(migration.original.get(dataKey), btoa("partial"));
  assert.equal(server.uploads, 1, "only the initial intact cloud snapshot was uploaded");
});

test("offline native saves survive a new coordinator instance and resume without an exit handler", async (t) => {
  const { runtime, storage, destinations, server, locks } = await setup(t);
  await runtime.syncDropbox({ beforeLaunch: true });
  const old = (await activeSets(destinations)).sets[0];
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
  assert.equal((await activeSets(destinations)).sets[0].hash, latest.hash);
  assert.equal(await syncStore.get(key("pending", profile)), undefined);
});

test("lost upload success replies retain the outbox until restart verifies publication", async (t) => {
  const { runtime, storage, destinations, server } = await setup(t);
  server.failAfterUpload = true;
  await runtime.syncDropbox();
  assert.equal(runtime.getDropboxState().phase, "waiting");
  const set = (await activeSets(destinations)).sets[0], profile = await saveProfileId(set);
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
  assert.equal((await activeSets(destinations)).sets[0].hash, set.hash);
  await runtime.syncDropbox({ beforeLaunch: true });
  assert.equal(changes, 1, "an actual restore notifies the library once");
});

test("a flagged launch restores the selected game before an unrelated upload finishes", async (t) => {
  const catalog = ["sky", "queen"].map(target => ({ target, displayTitle: target }));
  const { runtime, server, destinations } = await setup(t, "older local Sky save", catalog);
  const selected = { destination: { ...destinations.find(({ family }) => family === "queen"), isolated: true },
    files: [{ path: "queen.s01", data: bytes("selected game from Dropbox"), modifiedAt: 200 }] };
  selected.hash = await identifySet(selected);
  const original = await writeSnapshot(server, await makeSnapshot(selected));
  const cloudName = original.id + ".zip";
  const archived = server.files.get(cloudName);
  await syncStore.put({ id: "native/dropbox/" + account, config: "[cloud]\nstorage_Dropbox_access_token=synthetic\n" });
  const baseFetch = globalThis.fetch;
  const count = { list: 0, selected: 0, readbacks: 0 };
  const revision = server.revision.bind(server);
  server.revision = name => revision(name)?.padStart(9, "0");
  globalThis.fetch = async (url, options) => {
    if (url !== "https://content.dropboxapi.com/2/files/download") return baseFetch(url, options);
    const { path } = JSON.parse(options.headers["Dropbox-API-Arg"]);
    if (path === "/play-activity-v1.json") return Response.json({ error: { ".tag": "path", path: { ".tag": "not_found" } } }, { status: 409 });
    const name = path.split("/").at(-1);
    if (name === cloudName) count.selected++;
    else count.readbacks++;
    const blob = await server.download(name);
    return new Response(blob, { headers: { "Dropbox-API-Result": JSON.stringify({ name, rev: server.revision(name), size: blob.size }) } });
  };
  const { promise: firstList, resolve: enteredList } = Promise.withResolvers();
  const { promise: releaseFirst, resolve: resumeList } = Promise.withResolvers();
  const { promise: otherUpload, resolve: enteredUpload } = Promise.withResolvers();
  const { promise: releaseUpload, resolve: resumeUpload } = Promise.withResolvers();
  server.onRequest = async ({ op }) => {
    if (op === "list" && ++count.list === 1) { enteredList(); await releaseFirst; }
    if (op === "upload") { enteredUpload(); await releaseUpload; }
  };
  const background = runtime.syncDropbox();
  await firstList;
  const launch = runtime.syncDropbox({ beforeLaunch: true, launchDestinationKey: selected.destination.key });
  try {
    assert.equal(await Promise.race([launch.then(() => true), new Promise(resolve => setTimeout(() => resolve(false), 1000))]), true);
    await otherUpload;
    const { sets } = await activeSets(destinations);
    assert.deepEqual(sets.find(({ destination }) => destination.key === selected.destination.key).files, selected.files);
    assert.deepEqual(sets.find(({ destination }) => destination.family === "sky").files[0].data, bytes("older local Sky save"));
    assert.equal(server.uploads, 1, "the unrelated save is still waiting on its upload");
    assert.equal(runtime.getDropboxState().verified, false);
  } finally {
    resumeUpload();
    resumeList();
    await Promise.all([background, launch, runtime.syncDropbox()]);
  }
  assert.equal(runtime.getDropboxState().verified, true);
  assert.equal(count.selected, 1);
  assert.equal(count.readbacks, 1);
  assert.equal(server.files.get(cloudName), archived);
});

test("Continue uses an intact local save while an unrelated cloud archive is still downloading", async (t) => {
  const sky = { target: "sky", engineId: "sky", gameId: "sky", displayTitle: "Beneath a Steel Sky" };
  const lure = { target: "lure", displayTitle: "Lure of the Temptress" };
  const contents = "verified local progress";
  const { storage, server, runtime, destinations } = await setup(t, contents, [sky, lure]);
  await updateActive("scummweb.continue.v1:catalog:sky", {
    schemaVersion: 1, target: "sky", engineId: "sky", gameId: "sky", supported: true,
    saves: [{ slot: 1, name: "SKY-VM.001", size: bytes(contents).length, modifiedAt: 100 }],
  });
  const remote = { destination: destinations.find(({ key }) => key === "catalog:lure"),
    files: [{ path: "lure.001", data: bytes("unrelated cloud progress"), modifiedAt: 200 }] };
  remote.hash = await identifySet(remote);
  await writeSnapshot(server, await makeSnapshot(remote));
  const [cloudName] = server.files.keys();
  let release, started;
  const downloading = new Promise(resolve => { started = resolve; });
  const gate = new Promise(resolve => { release = resolve; });
  server.onRequest = async ({ op, name }) => {
    if (op === "download" && name === cloudName) { started(); await gate; }
  };
  const flight = runtime.syncDropbox();
  await downloading;
  const before = new Map(storage.values);
  const launch = prepareDropboxLaunch("catalog:sky", sky);
  try {
    assert.equal(await Promise.race([launch.then(() => true), new Promise(resolve => setTimeout(() => resolve(false), 100))]), true);
    assert.deepEqual(storage.values, before);
    assert.equal(server.files.size, 1);
  } finally { release(); await flight; await launch; }
  const { sets } = await activeSets(destinations);
  assert.deepEqual(sets.find(({ destination }) => destination.key === "catalog:sky").files[0].data, bytes(contents));
  assert.equal(sets.find(({ destination }) => destination.key === "catalog:lure").hash, remote.hash);
  assert.ok(server.files.has(cloudName));
});

test("Continue lets an already downloaded save for its edition commit before opening the player", { timeout: 5000 }, async t => {
  const game = { target: "sky", engineId: "sky", gameId: "sky", displayTitle: "Beneath a Steel Sky" };
  const { destinations, server, locks } = await setup(t, "the save shown on the card", [game]);
  // Launch and background sync share this exact runtime module in the app.
  const runtime = await import("../app/dropbox/runtime.mjs");
  await runtime.syncDropbox();
  const oldSave = (await activeSets(destinations)).sets[0];
  const profile = await saveProfileId(oldSave);
  await updateActive("scummweb.continue.v1:catalog:sky", {
    schemaVersion: 1, target: "sky", engineId: "sky", gameId: "sky", supported: true,
    saves: oldSave.files.map(({ path, data, modifiedAt }) => ({ slot: 1, name: path, size: data.length, modifiedAt })),
  });
  const remote = { ...oldSave, files: [...oldSave.files,
    { path: "SKY-VM.002", data: bytes("newer Dropbox save"), modifiedAt: 200 }] };
  remote.hash = await identifySet(remote);
  await writeSnapshot(server, await makeSnapshot(remote, (await syncStore.get(key("base", profile))).tips));
  const request = locks.request.bind(locks);
  const { promise: downloaded, resolve: ready } = Promise.withResolvers();
  const { promise: hold, resolve: release } = Promise.withResolvers();
  t.mock.method(locks, "request", async (name, options, run) => {
    if (name === saveLockName && options.mode === "exclusive") {
      ready();
      await hold;
    }
    return request(name, options, run);
  });
  const flight = runtime.syncDropbox();
  let launch;
  try {
    await downloaded;
    launch = prepareDropboxLaunch("catalog:sky", game);
    assert.equal(await Promise.race([launch.then(() => "launched"), new Promise(resolve => setTimeout(() => resolve("waiting"), 30))]), "waiting");
    assert.deepEqual((await activeSets(destinations)).sets[0].files, oldSave.files);
    release();
    await launch;
    assert.deepEqual((await activeSets(destinations)).sets[0].files, remote.files);
  } finally {
    release();
    await Promise.all([flight, launch]);
  }
});

test("a full browser defers only the affected restore, retains both sets and retries later", async (t) => {
  const { idb, server, runtime, destinations } = await setup(t, "local save", [
    { target: "sky", displayTitle: "Beneath a Steel Sky" }, { target: "queen", displayTitle: "Flight of the Amazon Queen" },
    { target: "lure", displayTitle: "Lure of the Temptress" },
  ]);
  const remoteSets = [];
  for (const [key, path, data] of [["queen", "queen.s01", bytes("small")], ["lure", "lure.001", new Uint8Array(40000)]]) {
    const set = { destination: { ...destinations.find(item => item.family === key), isolated: true },
      files: [{ path, data, modifiedAt: 100 }] };
    set.hash = await identifySet(set);
    remoteSets.push(set);
    await writeSnapshot(server, await makeSnapshot(set));
  }
  const initialCloud = [...server.files.keys()];
  let quotaFailures = 0;
  idb.fail = ({ name, names, writes }) => {
    if (name === "scummweb.active-saves" && names === "entries" && writes.some(({ record }) => record?.value?.length >= 40000)) {
      quotaFailures++;
      return new DOMException("full", "QuotaExceededError");
    }
  };
  await runtime.syncDropbox();
  assert.equal(runtime.getDropboxState().phase, "waiting");
  assert.match(runtime.getDropboxState().message, /storage is full/);
  const read = () => activeSets(destinations);
  const { sets } = await read();
  assert.equal(sets.find(({ destination }) => destination.family === "queen").hash, remoteSets[0].hash);
  assert.deepEqual(sets.find(({ destination }) => destination.family === "sky").files[0].data, bytes("local save"));
  assert.equal(sets.some(({ destination }) => destination.family === "lure"), false);
  assert.ok((await readStoredSets()).some(({ hash }) => hash === remoteSets[1].hash));
  assert.ok(initialCloud.every(name => server.files.has(name)));
  await runtime.syncDropbox();
  assert.equal(quotaFailures, 1);
  const retryTime = Date.now() + 120001;
  t.mock.method(Date, "now", () => retryTime);
  idb.fail = null;
  await runtime.syncDropbox();
  assert.equal((await read()).sets.find(({ destination }) => destination.family === "lure").hash, remoteSets[1].hash);
  assert.equal(runtime.getDropboxState().phase, "connected");
});

test("a damaged newer cloud archive quietly falls back to verified progress on an empty device", async (t) => {
  const { runtime, storage, destinations, server, locks } = await setup(t, null);
  const set = { destination: destinations[0], files: [{ path: "SKY-VM.001", data: bytes("previous save"), modifiedAt: 100 }] };
  set.hash = await identifySet(set);
  const older = await writeSnapshot(server, await makeSnapshot(set));
  const newer = { ...set, files: [{ path: "SKY-VM.001", data: bytes("newer, damaged in transit"), modifiedAt: 200 }] };
  newer.hash = await identifySet(newer);
  const latest = await makeSnapshot(newer, [older.id]);
  server.files.set(`${latest.id}.zip`, new Blob(["damaged"]));
  const before = new Map(server.files);
  await runtime.syncDropbox({ beforeLaunch: true, launchDestinationKey: set.destination.key });
  assert.equal((await activeSets(destinations)).sets[0].hash, set.hash);
  assert.equal(runtime.getDropboxState().phase, "connected");
  assert.equal(runtime.getDropboxState().message, "");
  assert.deepEqual(server.files, before, "recovery must not rewrite damaged or missing ancestry");
  const request = locks.request.bind(locks);
  t.mock.method(locks, "request", (name, options, run) => {
    if (name === saveLockName) assert.equal(options.mode, "shared", "a populated edition requires no repair lock");
    return request(name, options, run);
  });
  await runtime.syncDropbox({ beforeLaunch: true });
  assert.deepEqual((await activeSets(destinations)).sets[0].files, set.files);
});

test("an empty-edition fallback preserves local progress that arrived after the scan", async (t) => {
  const { runtime, destinations, server, locks } = await setup(t, null);
  await activeSets(destinations);
  const destination = destinations[0];
  const saved = { destination, files: [{ path: "SKY-VM.001", data: bytes("old cloud save"), modifiedAt: 100 }] };
  saved.hash = await identifySet(saved);
  await writeSnapshot(server, await makeSnapshot(saved));
  server.files.set(`${"f".repeat(64)}.zip`, new Blob(["damaged"]));
  const local = { ...saved, files: [{ path: "SKY-VM.002", data: bytes("new local save"), modifiedAt: 200 }] };
  local.hash = await identifySet(local);
  const request = locks.request.bind(locks);
  let arrived = false;
  t.mock.method(locks, "request", async (name, options, run) => {
    if (!arrived && name === saveLockName && options.mode === "exclusive") {
      arrived = true;
      const storage = await openSaveStorage();
      const { revision } = await getActiveSaveSets(storage, destinations);
      await applyImport({ storage, destinations, revision, initialConfig: "[scummvm]\n",
        rows: [{ set: local, destinationKey: destination.key, choice: "imported" }] });
    }
    return request(name, options, run);
  });
  await runtime.syncDropbox({ beforeLaunch: true });
  assert.equal(arrived, true);
  assert.deepEqual((await activeSets(destinations)).sets[0].files, local.files);
});

test("idle synchronization rechecks the collection without blocking Continue", async (t) => {
  const catalog = ["sky", "queen", "lure"].map((target) => ({ target, displayTitle: target }));
  const { runtime, server, locks, destinations } = await setup(t, null, catalog);
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
  const request = locks.request.bind(locks);
  const saveLockModes = [];
  t.mock.method(locks, "request", (name, options, run) => {
    if (name === saveLockName) {
      saveLockModes.push(options.mode);
      assert.equal(saveLaunchBlocked({ held: [{ name, mode: options.mode }] }, editionKey("", "sky")), false);
    }
    return request(name, options, run);
  });
  const idleStates = [];
  const unsubscribe = runtime.subscribeDropbox(() => idleStates.push(structuredClone(runtime.getDropboxState())));
  await runtime.syncDropbox({ beforeLaunch: true });
  unsubscribe();
  assert.deepEqual(saveLockModes, ["shared"], "a routine snapshot uses a shared root lock only");
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
  const base = (await activeSets(destinations)).sets[0];
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
  assert.equal((await activeSets(destinations)).sets[0].hash, latest.hash);
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
  assert.equal((await activeSets(destinations)).sets[0].hash, set.hash);
  assert.equal(runtime.getDropboxState().verified, true);
});

test("native byte progress updates the row without acknowledging uploads or accepting stale messages", async (t) => {
  const { runtime, storage, destinations, server } = await setup(t);
  await runtime.syncDropbox();
  const base = (await activeSets(destinations)).sets[0];
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
  const base = (await activeSets(destinations)).sets[0], profile = await saveProfileId(base);
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
  assert.equal((await activeSets(destinations)).sets[0].hash, remote.hash);
  assert.equal(runtime.getDropboxState().phase, "connected");
  assert.equal(await syncStore.get(key("pending", profile)), undefined);
});

test("a completed save arriving at the final check is drained before launch", async (t) => {
  const { runtime, storage, destinations, server } = await setup(t);
  await runtime.syncDropbox({ beforeLaunch: true });
  const base = (await activeSets(destinations)).sets[0], profile = await saveProfileId(base);
  const latest = { ...base, files: base.files.map((file) => ({ ...file, data: bytes("latest durable completed save") })) };
  latest.hash = await identifySet(latest);
  let listings = 0;
  const list = server.list.bind(server);
  server.list = async () => {
    if (++listings === 2) await syncStore.put({ id: key("pending", profile), set: latest, profile });
    return list();
  };
  await runtime.syncDropbox({ beforeLaunch: true });
  assert.equal((await activeSets(destinations)).sets[0].hash, latest.hash);
  assert.equal(runtime.getDropboxState().phase, "connected");
  assert.equal(await syncStore.get(key("pending", profile)), undefined);
});

test("continuous remote changes bound immediate recovery and leave a safe retry", async (t) => {
  const { runtime, storage, destinations, server } = await setup(t);
  await runtime.syncDropbox({ beforeLaunch: true });
  const base = (await activeSets(destinations)).sets[0], profile = await saveProfileId(base);
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
  assert.equal(new TextDecoder().decode((await activeSets(destinations)).sets[0].files[0].data), "remote revision 2");
});

test("first sync merges compatible local and cloud slots and acknowledges only the restored union", async (t) => {
  const { runtime, storage, destinations, server } = await setup(t);
  const local = (await activeSets(destinations)).sets[0];
  const remote = { ...local, files: [{ path: "SKY-VM.002", data: bytes("cloud slot"), modifiedAt: 200 }] };
  remote.hash = await identifySet(remote);
  await publishProfile({ client: await createSaveCollection(server), profile: await saveProfileId(remote), local: remote });
  await runtime.syncDropbox({ beforeLaunch: true });
  assert.equal(runtime.getDropboxState().phase, "connected");
  assert.equal(runtime.getDropboxState().conflicts.length, 0);
  const merged = (await activeSets(destinations)).sets[0], profile = await saveProfileId(merged);
  assert.deepEqual(merged.files.map(({ path }) => path).sort(), ["SKY-VM.001", "SKY-VM.002"]);
  assert.equal((await syncStore.get(key("base", profile))).hash, merged.hash);
  assert.equal(await syncStore.get(key("pending", profile)), undefined);
  await runtime.syncDropbox({ beforeLaunch: true });
  assert.equal(runtime.getDropboxState().phase, "connected");
  assert.equal((await activeSets(destinations)).sets[0].hash, merged.hash);
});

test("a killed first-sync merge restores its verified result without a baseline or a false conflict", async (t) => {
  const { runtime, storage, destinations, server } = await setup(t);
  const local = (await activeSets(destinations)).sets[0];
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
  assert.equal((await activeSets(destinations)).sets[0].hash, local.hash);
  const restarted = await import(`../app/dropbox/runtime.mjs?merged-reply=${crypto.randomUUID()}`);
  await restarted.syncDropbox({ beforeLaunch: true });
  assert.equal(restarted.getDropboxState().phase, "connected");
  assert.equal((await activeSets(destinations)).sets[0].hash, merged.hash);
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
  const download = server.download.bind(server);
  let downloads = 0;
  server.download = (...args) => { downloads++; return download(...args); };
  await runtime.syncDropbox({ beforeLaunch: true });
  assert.equal((await activeSets(destinations)).sets.length, 0);
  assert.ok((await readStoredSets()).some(({ hash }) => hash === set.hash));
  const firstDownloads = downloads;
  await runtime.syncDropbox({ beforeLaunch: true });
  assert.equal(downloads, firstDownloads, "an already preserved, unmatched save needs no repeat download");
  assert.equal(changes, 0, "preserving an unavailable edition must not trigger another sync pass");
  assert.equal(storage.getItem("/"), null);
  globalThis.fetch = fetcher;
  const source = { id: "reinstalled-source", name: "Missing edition.zip", fingerprint: set.destination.fingerprint };
  await saveGameSources([source]);
  await runtime.syncDropbox({ beforeLaunch: true });
  const { sets } = await activeSets(await getSaveDestinations([], [source]));
  assert.deepEqual(sets.find(({ hash }) => hash === set.hash)?.files, set.files);
  assert.ok((await readStoredSets()).some(({ hash }) => hash === set.hash));
});

test("cloud changes never replace a running player's working copy", async (t) => {
  const { runtime, storage, destinations, server, locks } = await setup(t);
  await runtime.syncDropbox({ beforeLaunch: true });
  const base = (await activeSets(destinations)).sets[0];
  const remote = { ...base, files: [{ path: "SKY-VM.001", data: bytes("remote"), modifiedAt: 200 }] };
  remote.hash = await identifySet(remote);
  await publishProfile({ client: await createSaveCollection(server), profile: await saveProfileId(base), local: remote, base: base.hash, baseTips: (await createSaveCollection(server)).head(await saveProfileId(base)).tips });
  locks.busy = true;
  await runtime.syncDropbox();
  assert.equal((await activeSets(destinations)).sets[0].hash, base.hash);
  assert.equal(runtime.getDropboxState().phase, "waiting");
  locks.busy = false;
  await runtime.syncDropbox({ beforeLaunch: true });
  assert.equal((await activeSets(destinations)).sets[0].hash, remote.hash);
});

test("a running isolated game publishes first while another edition restores safely", async (t) => {
  const catalog = ["sky", "queen", "lure"].map(target => ({ target, displayTitle: target }));
  const { runtime, server, destinations, locks } = await setup(t, "initial Sky progress", catalog);
  const sky = destinations.find(destination => destination.family === "sky");
  const queen = destinations.find(destination => destination.family === "queen");
  const lure = destinations.find(destination => destination.family === "lure");
  const initial = await openSaveStorage();
  initializeSaveEdition(initial, "catalog-sky");
  await initial.commit();
  await runtime.syncDropbox();
  const skyBefore = (await activeSets(destinations)).sets.find(set => set.destination.key === sky.key);
  const skyProfile = await saveProfileId(skyBefore);
  const baseline = await syncStore.get(key("base", skyProfile));
  const keep = await server.download(baseline.tips[0] + ".zip");
  const make = async (destination, files) => {
    const set = { destination: { ...destination, isolated: true }, files };
    return { ...set, hash: await identifySet(set) };
  };
  const file = (path, text, modifiedAt) => ({ path, data: bytes(text), modifiedAt });
  const playerSave = await make(sky, [...skyBefore.files, file("SKY-VM.002", "new player checkpoint", 200)]);
  const incomingSky = await make(sky, [...skyBefore.files, file("SKY-VM.003", "other device slot", 300)]);
  const queenSave = await make(queen, [file("queen.s01", "other game from Dropbox", 200)]);
  const lureSave = await make(lure, [file("lure.001", "independent outbox", 200)]);
  const remoteSkyNode = await writeSnapshot(server, await makeSnapshot(incomingSky, baseline.tips));
  const remoteQueenNode = await writeSnapshot(server, await makeSnapshot(queenSave));
  const earlier = await activeSets(destinations);
  await applyImport({ storage: await openSaveStorage(), destinations, revision: earlier.revision,
    rows: [{ set: playerSave, destinationKey: sky.key, choice: "imported" }] });
  const playerIndex = "scummweb.continue.v1:" + sky.key;
  await updateActive(playerIndex, { engineId: "sky", gameId: "sky", pending: [], saves: [{ name: "SKY-VM.002", slot: 2 }] });
  const untouchedIndex = (await openSaveStorage()).getItem(playerIndex);
  const expectedUpload = (await makeSnapshot(playerSave, baseline.tips)).id + ".zip";
  const uploads = [];
  server.onRequest = data => { if (data.op === "upload") uploads.push(data.name); };
  locks.busy = "shared";
  locks.editionBusy = "scummweb-saves:edition:catalog-sky";
  await syncStore.put({ id: key("pending", await saveProfileId(lureSave)), profile: await saveProfileId(lureSave), set: lureSave });
  const endPlay = runtime.prioritizeDropboxGameplay(sky.key);
  await runtime.queuePlayerSave(playerSave);
  await runtime.syncDropbox();
  const during = (await activeSets(destinations)).sets;
  assert.equal((await readNode(server, uploads[0].slice(0, -4))).profile, skyProfile);
  assert.ok(server.files.has(expectedUpload));
  assert.equal(await syncStore.get(key("pending", skyProfile)), undefined);
  assert.equal(await syncStore.get(key("pending", await saveProfileId(lureSave))), undefined);
  assert.deepEqual(during.find(set => set.destination.key === sky.key).files, playerSave.files);
  assert.deepEqual(during.find(set => set.destination.key === queen.key).files, queenSave.files);
  assert.equal((await openSaveStorage()).getItem(playerIndex), untouchedIndex, "other restore must preserve the running game's index");
  assert.ok((await readStoredSets()).some(({ files }) => files.some(entry => entry.path === "SKY-VM.003")));
  assert.equal(await server.download(baseline.tips[0] + ".zip"), keep);
  assert.ok(server.files.has(remoteSkyNode.id + ".zip") && server.files.has(remoteQueenNode.id + ".zip"));
  locks.busy = false;
  locks.editionBusy = null;
  endPlay();
  await runtime.syncDropbox();
  const settled = (await activeSets(destinations)).sets.find(set => set.destination.key === sky.key);
  assert.deepEqual(settled.files.find(entry => entry.path === "SKY-VM.002"), playerSave.files[1]);
  assert.deepEqual(settled.files.find(entry => entry.path === "SKY-VM.003"), incomingSky.files[1]);
  assert.equal(runtime.getDropboxState().verified, true);
});

test("disconnect during upload prevents subsequent cloud writes and local restore", async (t) => {
  const { runtime, server } = await setup(t);
  const before = (await openSaveStorage()).getItem("/");
  server.onUpload = () => { void runtime.disconnectDropbox(); };
  await runtime.syncDropbox();
  assert.equal(runtime.getDropboxState().phase, "disconnected");
  assert.equal(server.uploads, 1);
  assert.equal((await openSaveStorage()).getItem("/"), before);
});

test("missing persisted native credentials require reconnect without cloud writes", async (t) => {
  const { runtime, sessions, server } = await setup(t);
  await syncStore.remove("native/dropbox/" + account);
  await assert.rejects(runtime.syncDropbox({ beforeLaunch: true }), /Reconnect Dropbox/);
  assert.equal(server.uploads, 0);
  assert.equal(runtime.getDropboxState().phase, "reconnect");
});

test("scans and acknowledgements preserve newer pending saves and disconnected credentials", async (t) => {
  await setup(t);
  const id = key("pending", "synthetic-profile");
  await syncStore.putIfAbsent({ id, set: { hash: "first scan" } });
  assert.equal((await syncStore.get(id)).set.hash, "first scan");
  await syncStore.put({ id, set: { hash: "newer" } });
  await syncStore.putIfAbsent({ id, set: { hash: "older snapshot" } });
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

test("an incomplete save quietly leaves the browser available for local play", async (t) => {
  const { runtime, storage } = await setup(t);
  await updateActive("scummweb.continue.v1:synthetic", { pending: ["SKY-VM.001"] });
  await runtime.syncDropbox({ beforeLaunch: true, launchDestinationKey: "catalog:sky" });
  assert.equal(runtime.getDropboxState().phase, "connected");
  assert.equal(runtime.getDropboxState().message, "");
  assert.equal(runtime.getDropboxState().verified, false);
});

const baseballPath = "baseball-records.bbl";
async function baseballFixture(t, pending = [baseballPath], content = "") {
  const catalog = [{ target: "sky", displayTitle: "Beneath a Steel Sky" }];
  const result = await setup(t, "local progress", catalog);
  const source = { id: "backyard-baseball-fixture", name: "Backyard Baseball.zip", fingerprint: "5".repeat(64) };
  await saveGameSources([source]);
  const destinations = await getSaveDestinations(catalog, [source]);
  const destination = destinations.find(({ fingerprint }) => fingerprint === source.fingerprint);
  const marker = `scummweb.continue.v1:${destination.key}`;
  const makeSet = async (contents, time, sibling = "") => {
    const files = [{ path: baseballPath, data: bytes(contents), modifiedAt: time }];
    if (sibling) files.push({ path: "baseball.s01", data: bytes(sibling), modifiedAt: time });
    const set = { destination, files };
    return { ...set, hash: await identifySet(set) };
  };
  const incomplete = await makeSet(content, 400, "another local slot");
  const current = await activeSets(destinations);
  await applyImport({ storage: await openSaveStorage(), destinations, revision: current.revision,
    rows: [{ set: incomplete, destinationKey: destination.key, choice: "imported" }] });
  await updateActive(marker, { schemaVersion: 1, engineId: "scumm", gameId: "baseball",
    target: "baseball", saves: [], pending });
  return { ...result, destination, marker, makeSet, getWorking: async () => (await activeSets(destinations)).sets
    .find(item => item.destination.key === destination.key) };
}

test("Baseball recovery keeps both originals, restores verified history and completes sync", async t => {
  const { server, runtime, destination, marker, makeSet, getWorking } = await baseballFixture(t);
  const valid = await makeSet("verified cloud records", 200);
  const original = await writeSnapshot(server, await makeSnapshot(valid));
  const bad = await makeSet("", 500, "another cloud slot");
  const badHead = await writeSnapshot(server, await makeSnapshot(bad, [original.id]));
  const [before, damagedBefore] = await Promise.all([server.download(original.id + ".zip"), server.download(badHead.id + ".zip")]);
  await runtime.syncDropbox({ beforeLaunch: true, launchDestinationKey: destination.key });
  await runtime.syncDropbox();
  assert.equal(runtime.getDropboxState().verified, true);
  const working = await getWorking();
  assert.deepEqual(working.files.find(file => file.path === baseballPath), valid.files[0]);
  assert.ok(working.files.some(file => file.path === "baseball.s01" && file.data.length > 0));
  const olderCopies = (await readStoredSets()).filter(set => set.destination.key === destination.key);
  assert.ok(olderCopies.some(set => set.files.length === 1 && !set.files[0].data.length));
  assert.ok(olderCopies.some(set => set.files.some(file => Buffer.from(file.data).toString() === "another local slot")));
  assert.deepEqual(JSON.parse((await openSaveStorage()).getItem(marker))?.pending ?? [], []);
  assert.deepEqual(await (await server.download(original.id + ".zip")).arrayBuffer(), await before.arrayBuffer());
  assert.deepEqual(await (await server.download(badHead.id + ".zip")).arrayBuffer(), await damagedBefore.arrayBuffer());
  const collection = await createSaveCollection(server);
  const profile = await saveProfileId({ destination });
  assert.equal((await readSnapshot(collection, profile, collection.head(profile).active)).hash, working.hash);
});

test("Baseball recovery archives the empty file when no replacement exists and retries idempotently", async t => {
  const { runtime, server, destination, getWorking } = await baseballFixture(t);
  location.search = "?dropbox=false";
  await runtime.syncDropbox();
  assert.equal((await getWorking()).files.find(file => file.path === baseballPath).data.length, 0);
  assert.equal(server.uploads, 0);
  location.search = "?dropbox=true";
  await runtime.syncDropbox({ beforeLaunch: true });
  assert.equal(runtime.getDropboxState().verified, true);
  assert.deepEqual((await getWorking()).files.map(file => file.path), ["baseball.s01"]);
  const copies = await readStoredSets();
  assert.ok(copies.some(set => set.destination.key === destination.key && set.files.length === 1 && !set.files[0].data.length));
  const uploads = server.uploads;
  await runtime.syncDropbox({ beforeLaunch: true });
  assert.equal(server.uploads, uploads);
});

test("Baseball recovery waits for durable archival and prefers a complete local recovery copy", async t => {
  const { runtime, idb, marker, makeSet, getWorking } = await baseballFixture(t);
  const valid = await makeSet("verified local records", 300);
  await preserveSets([valid]);
  idb.fail = ({ name, mode, writes }) => name === "scummweb.save-backups" && mode === "readwrite"
    && writes.some(({ record }) => record?.files?.length === 1 && record.files[0].path === baseballPath && !record.files[0].data.length)
    ? new DOMException("disk full", "QuotaExceededError") : undefined;
  await assert.rejects(runtime.syncDropbox({ beforeLaunch: true }), { name: "QuotaExceededError" });
  assert.deepEqual(JSON.parse((await openSaveStorage()).getItem(marker)).pending, [baseballPath]);
  assert.equal((await getWorking()).files.find(file => file.path === baseballPath).data.length, 0);
  idb.fail = ({ name, writes }) => name === "scummweb.active-saves" && writes.some(({ key }) => key === marker)
    ? new DOMException("simulated interruption", "AbortError") : undefined;
  await assert.rejects(runtime.syncDropbox({ beforeLaunch: true }), { name: "AbortError" });
  assert.deepEqual(JSON.parse((await openSaveStorage()).getItem(marker)).pending, [baseballPath]);
  assert.equal((await getWorking()).files.find(file => file.path === baseballPath).data.length, 0);
  assert.ok((await readStoredSets()).some(set => set.files.length === 1 && !set.files[0].data.length));
  idb.fail = null;
  await runtime.syncDropbox({ beforeLaunch: true });
  assert.equal(runtime.getDropboxState().verified, true);
  assert.deepEqual((await getWorking()).files.find(file => file.path === baseballPath), valid.files[0]);
});

for (const [pending, contents] of [[[baseballPath, "baseball.s01"], ""], [[baseballPath], "partial nonempty bytes"]]) {
  test(`Baseball recovery preserves an ambiguous pending set ${pending.length}/${contents.length}`, async t => {
    const { runtime, marker, getWorking } = await baseballFixture(t, pending, contents);
    await runtime.syncDropbox({ beforeLaunch: true });
    assert.equal(runtime.getDropboxState().verified, false);
    assert.deepEqual(JSON.parse((await openSaveStorage()).getItem(marker)).pending, pending);
    assert.equal((await getWorking()).files.find(file => file.path === baseballPath).data.length, contents.length);
  });
}


test("overlapping first-sync progress resolves automatically and keeps both complete originals", async (t) => {
  const { runtime, storage, destinations, server } = await setup(t);
  const local = (await activeSets(destinations)).sets[0];
  const remote = { ...local, files: local.files.map((file) => ({ ...file, data: bytes("newer remote progress"), modifiedAt: 200 })) };
  remote.hash = await identifySet(remote);
  await writeSnapshot(server, await makeSnapshot(remote));
  await runtime.syncDropbox({ beforeLaunch: true });
  assert.equal(runtime.getDropboxState().phase, "connected");
  assert.equal(runtime.getDropboxState().conflicts.length, 0);
  assert.equal((await activeSets(destinations)).sets[0].hash, remote.hash);
  const preserved = await readStoredSets();
  assert.ok([local, remote].every((set) => preserved.some(({ hash }) => hash === set.hash)));
  const uploads = server.uploads;
  await runtime.syncDropbox({ beforeLaunch: true });
  assert.equal(server.uploads, uploads, "a settled automatic decision must not republish");
});

test("an interrupted automatic choice retains local progress until restart verifies the cloud result", async (t) => {
  const { runtime, storage, destinations, server } = await setup(t);
  await runtime.syncDropbox({ beforeLaunch: true });
  const local = (await activeSets(destinations)).sets[0], profile = await saveProfileId(local);
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
  assert.equal((await activeSets(destinations)).sets[0].hash, local.hash);
  const restarted = await import(`../app/dropbox/runtime.mjs?automatic-restart=${crypto.randomUUID()}`);
  await restarted.syncDropbox({ beforeLaunch: true });
  assert.equal(restarted.getDropboxState().phase, "connected");
  assert.equal((await activeSets(destinations)).sets[0].hash, branches[1].hash);
  assert.equal(await syncStore.get(key("pending", profile)), undefined);
  const preserved = await readStoredSets();
  assert.ok(branches.every((set) => preserved.some(({ hash }) => hash === set.hash)));
});


test("a different pre-release storage layout cannot supply baselines to the saves collection", async (t) => {
  const { runtime, storage, destinations, server } = await setup(t);
  const set = (await activeSets(destinations)).sets[0], profile = await saveProfileId(set);
  const legacy = { id: `${account}/base/${profile}`, hash: "a".repeat(64), tips: ["b".repeat(64)] };
  await syncStore.put(legacy);
  await runtime.syncDropbox({ beforeLaunch: true });
  assert.equal(runtime.getDropboxState().phase, "connected");
  assert.equal((await syncStore.get(key("base", profile))).hash, set.hash);
  assert.deepEqual(await syncStore.get(legacy.id), legacy, "other layouts remain untouched");
  assert.ok(server.files.size > 0);
});
