import { prepareDropboxLaunch } from "/app/dropbox/bridge.mjs";
import { connectionKey } from "/app/dropbox/client.mjs";
import { recordKey, workingSaveBudget } from "/app/dropbox/local-cache.mjs";
import { createSaveCollection, readSnapshot, saveProfileId } from "/app/dropbox/protocol.mjs";
import { requiresDropboxRestore, syncDropbox } from "/app/dropbox/runtime.mjs";
import { syncStore } from "/app/dropbox/store.mjs";
import { applyImport, getActiveSaveSets, getSaveDestinations, identifySet } from "/app/save-backups/backups.mjs";
import { editionKey, editionLockName, saveLockName } from "/web-shell/save-editions.mjs";
import { openSaveStorage } from "/web-shell/save-storage.mjs";

const mib = 1024 * 1024;
const config = "[cloud]\ncurrent_storage=1\n";
const account = "browser-storage-test";
const connectionId = "browser-storage-test-connection";
const checks = [];

function expect(condition, message) {
  if (!condition) throw new Error(message);
}

async function run() {
  const { games } = await (await fetch("/games.json")).json();
  const destinations = await getSaveDestinations(games, []);
  const active = async () => (await getActiveSaveSets(await openSaveStorage(), destinations)).sets;
  let headroom = 64 * mib;
  let estimateReads = 0;
  Object.defineProperty(navigator.storage, "estimate", {
    configurable: true,
    value: async () => {
      estimateReads++;
      return { usage: 100 * mib, quota: 100 * mib + headroom };
    },
  });

  const cloud = new Map();
  const reads = new Map();
  let raceWhenRead, pendingWrite;
  let writes = 0;
  window.answerFixtureCloudRequest = async ({ op, name, bytes, config: suppliedConfig }) => {
    switch (op) {
      case "init":
        expect(suppliedConfig === config, "Unexpected provider configuration.");
        return {};
      case "list":
        return { entries: Array.from(cloud, ([name, bytes]) => ({ name, size: bytes.length, revision: name })) };
      case "download":
        expect(cloud.has(name), "The requested fixture archive does not exist.");
        reads.set(name, (reads.get(name) || 0) + 1);
        if (name === raceWhenRead) {
          raceWhenRead = undefined;
          await syncStore.put(pendingWrite);
        }
        return { bytes: cloud.get(name) };
      case "upload":
        expect(!cloud.has(name), "An immutable archive was uploaded twice.");
        cloud.set(name, bytes);
        writes++;
        return {};
      default:
        throw new Error(`Unexpected provider operation ${op}.`);
    }
  };

  localStorage.setItem(connectionKey, JSON.stringify({ enabled: true, accountId: account, connectionId }));
  await syncStore.put({ id: "native/dropbox/" + account, connectionId, config, refreshAfter: Date.now() + 60 * 60 * 1000 });

  const names = { sky: "SKY-VM.001", queen: "queen.s01", lure: "lure.001" };
  const originals = await Promise.all(destinations.filter(({ family }) => names[family]).map(async destination => {
    const set = { destination: { ...destination, isolated: true },
      files: [{ path: names[destination.family], data: new TextEncoder().encode(destination.family), modifiedAt: 1000 }] };
    return { ...set, hash: await identifySet(set), profile: await saveProfileId(set) };
  }));
  const storage = await openSaveStorage();
  await applyImport({ storage, destinations, revision: storage.revision, initialConfig: "[scummvm]\n",
    preserve: () => {}, rows: originals.map(set => ({ set, destinationKey: set.destination.key, choice: "imported" })) });
  await syncDropbox();

  const archived = () => createSaveCollection({
    list: async () => [...cloud.keys()],
    download: async name => new Blob([cloud.get(name)]),
  });
  const baseline = await archived();
  const complete = await active();
  expect(complete.length === originals.length, "Initial sync changed the working edition count.");
  expect(complete.reduce((total, set) => total + set.files.reduce((bytes, file) => bytes + file.data.length, 0), 0)
    < workingSaveBudget, "The fixture must stay below the independent working-save limit.");
  for (const set of originals) expect(baseline.head(set.profile).active === set.hash, `Missing verified cloud copy for ${set.destination.key}.`);
  checks.push("working copies verified in the cloud");

  const evict = originals.find(({ destination }) => destination.family === "queen");
  const playing = originals.find(({ destination }) => destination.family === "sky");
  const pending = originals.find(({ destination }) => destination.family === "lure");
  const latest = { destination: pending.destination,
    files: [{ ...pending.files[0], data: new TextEncoder().encode("new pending progress"), modifiedAt: 2000 }] };
  latest.hash = await identifySet(latest);
  pendingWrite = { id: recordKey(account, "pending", pending.profile), profile: pending.profile, set: latest };

  const playingReady = Promise.withResolvers(), stopPlaying = Promise.withResolvers();
  const player = navigator.locks.request(saveLockName, { mode: "shared" }, () =>
    navigator.locks.request(editionLockName(editionKey("", playing.destination.family)), async () => {
      playingReady.resolve();
      await stopPlaying.promise;
    }));
  try {
    await playingReady.promise;
    const readsBefore = new Map(reads);
    raceWhenRead = baseline.head(pending.profile).tips[0] + ".zip";
    headroom = 8 * mib;
    const estimateReadsBefore = estimateReads;
    await syncDropbox();
    expect(estimateReads > estimateReadsBefore, "The coordinator did not read the browser storage estimate.");
    const remaining = await active();
    expect(remaining.length === 2 && !remaining.some(set => set.hash === evict.hash), "Only the verified idle edition should be evicted.");
    const victimArchive = baseline.head(evict.profile).tips[0] + ".zip";
    expect(reads.get(victimArchive) > (readsBefore.get(victimArchive) || 0), "Eviction did not read back the exact cloud copy.");
    expect(await requiresDropboxRestore(evict.destination.key), "The browser did not record the cloud-only edition.");
    checks.push("low estimate evicted only the verified idle edition");

    expect(!raceWhenRead && remaining.some(set => set.hash === playing.hash)
      && remaining.some(set => set.hash === pending.hash), "A running or newly pending edition was lost.");
    const queued = await syncStore.get(pendingWrite.id);
    const afterPressure = await archived();
    expect(queued?.set.hash === latest.hash || afterPressure.head(pending.profile).snapshots.includes(latest.hash),
      "Newly pending bytes are missing from both the outbox and Dropbox.");
    checks.push("pending bytes and running edition retained");
  } finally {
    stopPlaying.resolve();
    await player;
  }

  headroom = 64 * mib;
  await syncDropbox();
  expect(!(await active()).some(set => set.destination.key === evict.destination.key), "Background sync eagerly restored the evicted edition.");
  checks.push("background sync left the evicted edition cloud-only");

  const beforeLaunchWrites = writes;
  await prepareDropboxLaunch(evict.destination.key, games.find(({ target }) => target === evict.destination.family));
  await syncDropbox();
  const restored = (await active()).find(set => set.destination.key === evict.destination.key);
  expect(restored?.hash === evict.hash && restored.files[0].modifiedAt === evict.files[0].modifiedAt,
    "Launch did not restore the original verified bytes and file time.");
  const remote = await readSnapshot(await archived(), evict.profile, evict.hash);
  expect(remote.hash === restored.hash && writes === beforeLaunchWrites
    && !await requiresDropboxRestore(evict.destination.key), "Restore changed cloud history or left the eviction receipt behind.");
  checks.push("launch restored the exact files without a cloud write");
}

const report = await run().then(() => ({ ok: true, checks }), error => ({ ok: false, error: error.stack, checks }));
document.querySelector("#result").textContent = report.ok ? "Storage pressure integration passed." : report.error;
await fetch(`/result${location.pathname}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(report) });
