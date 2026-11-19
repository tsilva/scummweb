import { createNativeCloudClient, credentialKey, dropboxNativeConfig } from "../cloud/native-client.mjs";
import { dropboxPreviewEnabled } from "./feature.mjs";
import { trackCloudTransfers } from "../cloud/transfer-progress.mjs";
import { authorizationRequest, connectionKey, DropboxError, exchangeCode, sessionKey } from "./client.mjs";
import { createSaveCollection, publishProfile, readSnapshot, saveProfileId } from "./protocol.mjs";
import { syncStore } from "./store.mjs";
import { syncPlayActivity } from "./activity-sync.mjs";
import { activityCacheKey } from "../game-player/activity.mjs";
import { applyImport, getActiveSaveSets, getSaveDestinations, identifySet, matchDestination, preserveSets,
  readStoredSets, saveLockName } from "../save-backups/backups.mjs";
import { captureFilesystem, replaceEmptySaveFile } from "../save-backups/filesystem.mjs";
import { baseballRecordsPath, hasEmptyBaseballRecords, newestBaseballRecords } from "../save-backups/baseball-records.mjs";
import { readIncompleteSaveWrites } from "../save-backups/incomplete-writes.mjs";
import { readGameSources } from "../game-sources.mjs";
import { editionDirectory, editionKey, editionLockName, matchesLegacySave, saveDirectory } from "../../web-shell/save-editions.mjs";
import { ensureSaveStorage, openSaveStorage } from "../../web-shell/save-storage.mjs";

const ownerKey = "scummweb.dropbox-owner.v1";
const listeners = new Set();
let state = { phase: "disconnected", message: "", conflicts: [], checking: false, verified: false, transferProgress: null };
let flight = null, flightController, queue = Promise.resolve(), generation = 0, contextPromise;
let connecting = false, localGeneration = 0;
let flightPriority, flightPlayback, playing;
let launchSyncSnapshot = null;
let activityController;
const restoreSpaceWait = new Map();
const downloadedRestores = new Map();
const restoreSpaceMessage = "Browser storage is full. Saves that could not be restored are retained in Dropbox.";
const isQuotaError = (error) => [error?.name, error?.cause?.name].includes("QuotaExceededError");
const appKey = () => process.env.NEXT_PUBLIC_DROPBOX_APP_KEY || "";
export function dropboxConfigured() { return Boolean(appKey()); }
export function getDropboxState() { return state; }
export function subscribeDropbox(listener) { listeners.add(listener); return () => listeners.delete(listener); }
export async function waitForDownloadedSave(destinationKey) {
  const pending = downloadedRestores.get(destinationKey);
  return pending ? Boolean((await pending.catch(() => null))?.restored) : false;
}
function update(next) {
  if (next.phase && next.phase !== "syncing") next = { transferProgress: null, ...next };
  state = { ...state, ...next }; for (const listener of listeners) listener();
}
export function markWaiting(message = "Your latest saves are on this device and waiting to sync.") {
  update({ phase: "waiting", message, verified: false });
}
function connection() {
  try { return JSON.parse(localStorage.getItem(connectionKey)); } catch { return null; }
}
function session() { return dropboxPreviewEnabled() && connection()?.enabled ? connection() : null; }
function failure(error) {
  if (error.kind === "cancelled" || error.kind === "priority") return;
  if (error.kind === "integrity") { update({ phase: "connected", message: "", verified: false }); return; }
  update({ phase: !connection()?.enabled ? "disconnected" : error.kind === "auth" ? "reconnect" : "waiting",
    message: error instanceof DropboxError ? error.message : isQuotaError(error) ? restoreSpaceMessage
      : "Could not sync saves. Your local copies are retained.", verified: false });
}
async function context() {
  if (!contextPromise) {
    const loading = (async () => {
      const response = await fetch("/games.json", { cache: "no-cache", signal: AbortSignal.timeout(15000) });
      if (!response.ok) throw new DropboxError("Could not identify the saved games. Try again shortly.");
      const { games } = await response.json();
      if (!Array.isArray(games)) throw new DropboxError("Could not read game information.");
      return games.map((game) => ({ ...game, displayTitle: game.displayTitle || game.title || game.target }));
    })().catch((error) => { if (contextPromise === loading) contextPromise = null; throw error; });
    contextPromise = loading;
  }
  const catalog = await contextPromise;
  const sources = await readGameSources(catalog);
  return { destinations: await getSaveDestinations(catalog, sources), sources };
}

function syncAccountActivity(client, auth, sources) {
  if (!client || activityController) return;
  const controller = new AbortController();
  activityController = controller;
  const check = () => {
    controller.signal.throwIfAborted();
    const current = session();
    if (!current || current.accountId !== auth.accountId || current.connectionId !== auth.connectionId) {
      throw new DropboxError("Dropbox disconnected.", "cancelled");
    }
  };
  // The separate lock and lifecycle keep activity out of save and launch gates.
  void navigator.locks.request("scummweb-dropbox-activity", { ifAvailable: true, signal: controller.signal }, async (lock) => {
    if (!lock) return;
    try {
      await syncPlayActivity({ client, scope: window, account: auth.accountId, sources, check, signal: controller.signal });
      check();
      if (state.activityWaiting) update({ activityWaiting: false });
    } catch {
      try { check(); } catch { return; }
      if (!state.activityWaiting) update({ activityWaiting: true });
    }
  }).catch(() => {}).finally(() => {
    if (activityController === controller) activityController = null;
  });
}

function stopAccountActivity() {
  activityController?.abort();
  activityController = null;
  if (state.activityWaiting) update({ activityWaiting: false });
}
async function lockedSaves(action, { readOnly = false, destination } = {}) {
  if (!navigator.locks) throw new DropboxError("This browser cannot safely coordinate cloud saves.");
  const db = await ensureSaveStorage().catch(error => {
    if (error.name !== "SaveSessionBusyError") throw error;
    return null;
  });
  const busy = { busy: true };
  if (!db) return busy;
  const locks = navigator.locks;
  // IndexedDB returns a committed snapshot even while an isolated player is
  // running. Reading it must not take the exclusive lock used to restore saves.
  if (readOnly) return locks.request(saveLockName, { mode: "shared", ifAvailable: true },
    async lock => lock ? action(await openSaveStorage(db)) : busy);
  const exclusive = await locks.request(saveLockName, { mode: "exclusive", ifAvailable: true },
    async (lock) => lock ? action(await openSaveStorage(db), false) : busy);
  if (exclusive !== busy) return exclusive;
  const edition = destination?.key !== "shared" && editionKey(destination?.namespace, destination?.family);
  if (!edition) return busy;
  return locks.request(saveLockName, { mode: "shared", ifAvailable: true }, async root => {
    if (!root) return busy;
    return locks.request(editionLockName(edition), { mode: "exclusive", ifAvailable: true }, editionLock => {
      if (!editionLock) return { busy: true, playing: true };
      // Taking the same setup lock as the native player serializes changes to
      // the shared root. Running players write only beneath their own roots.
      return locks.request(saveLockName + ":setup", { mode: "exclusive", ifAvailable: true },
        async setup => setup ? action(await openSaveStorage(db), true) : busy);
    });
  });
}
// Baselines and cached nodes belong to this storage layout and snapshot format.
const recordKey = (account, kind, profile) => `${account}/saves-v1/${kind}/${profile}`;
function baseballRepairs(storage, destinations, active, incomplete) {
  const repairs = [];
  for (const entry of incomplete) {
    if (entry.engineId !== "scumm" || entry.gameId !== "baseball" || entry.files.length !== 1
      || entry.files[0].name !== baseballRecordsPath || entry.files[0].size !== 0) continue;
    const destination = destinations.find(({ key }) => key !== "shared" && key === entry.destinationKey);
    if (!destination) continue;
    const index = JSON.parse(storage.getItem(entry.key));
    if (index.pending.length !== 1 || index.pending[0] !== baseballRecordsPath) continue;
    const editionSets = active.sets.filter(set => set.destination.key === destination.key);
    const damaged = editionSets.filter(hasEmptyBaseballRecords);
    if (damaged.length !== 1) continue;
    repairs.push({ entry, destination, index, editionSets, damaged: damaged[0] });
  }
  return repairs;
}

async function recoverInterruptedBaseballRecords(storage, destinations, client, check) {
  let active = await getActiveSaveSets(storage, destinations);
  const incomplete = readIncompleteSaveWrites(storage, destinations, active.sets);
  for (const { entry, destination, index, editionSets, damaged } of baseballRepairs(storage, destinations, active, incomplete)) {
    const copy = { destination: damaged.destination, files: damaged.files.filter(file => file.path === baseballRecordsPath && !file.data.length) };
    copy.hash = await identifySet(copy);
    // Strictly commit the recovery copy before touching the working file.
    await preserveSets([copy]);
    check();
    const stored = await readStoredSets();
    const local = newestBaseballRecords([...editionSets, ...stored.filter(set => matchDestination(set, [destination]))]);
    const replacement = await client.recoverBaseballRecords(await saveProfileId({ destination }), local, check);
    check();
    if (!replaceEmptySaveFile(storage, { edition: editionKey(destination.namespace, destination.family),
      namespace: destination.namespace, path: baseballRecordsPath, replacement, revision: active.revision })) continue;
    storage.setItem(entry.key, JSON.stringify({ ...index, pending: [], revision: null,
      saves: Array.isArray(index.saves) ? index.saves.filter(save => save?.name !== baseballRecordsPath) : [] }));
    await storage.commit();
    // The updated tree and cleared marker are one IndexedDB transaction.
    window.dispatchEvent(new Event("scummweb:saves-changed"));
    active = await getActiveSaveSets(storage, destinations);
  }
  return active;
}

async function scanLocalSaves(destinations, client, check) {
  // Release the shared lock after the snapshot, before hashing saves or
  // touching the separate Dropbox outbox and recovery databases.
  const snapshot = await lockedSaves(storage => storage, { readOnly: true });
  if (snapshot.busy) return snapshot;
  check();
  const active = await getActiveSaveSets(snapshot, destinations);
  const incomplete = readIncompleteSaveWrites(snapshot, destinations, active.sets);
  if (baseballRepairs(snapshot, destinations, active, incomplete).length) {
    const repaired = await lockedSaves(async storage => {
      const active = await recoverInterruptedBaseballRecords(storage, destinations, client, check);
      return { active, incomplete: readIncompleteSaveWrites(storage, destinations, active.sets) };
    });
    if (!repaired.busy) return repaired;
  }
  return { active, incomplete };
}

async function withoutEmptyRecords(set) {
  if (!hasEmptyBaseballRecords(set)) return set;
  const files = set.files.filter(file => file.path !== baseballRecordsPath || file.data.length);
  if (!files.length) return null;
  const clean = { ...set, files };
  return { ...clean, hash: await identifySet(clean) };
}

async function enqueue(account, set) {
  const original = { ...set, hash: await identifySet(set) };
  const usable = await withoutEmptyRecords(original);
  if (usable !== original) await preserveSets([original]);
  if (!usable) return;
  const profile = await saveProfileId(usable);
  await syncStore.put({ id: recordKey(account, "pending", profile), set: usable, profile });
}
export function queuePlayerSave(set) {
  const account = session()?.accountId;
  if (!account) return Promise.resolve();
  localGeneration++;
  update({ phase: "preparing", message: "", verified: false });
  queue = queue.catch(() => {}).then(async () => {
    const { destinations } = await context();
    const destination = destinations.find(({ key }) => key === set.destination.key);
    if (destination) set.destination = { ...destination, ...(set.destination.isolated && { isolated: true }) };
    // Preserve the last complete bytes in IndexedDB before attempting network IO.
    await enqueue(account, set);
  }).catch((error) => { failure(error); throw error; });
  void queue.then(async () => {
    if (playing?.destination === set.destination.key && flight && !flightPriority?.waiting
      && (flightPlayback?.destination !== playing.destination || flightPlayback.background)) {
      flightController?.abort(new DropboxError("Prioritizing the latest save from the running game.", "priority"));
      await flight.catch(() => {});
    }
    await syncDropbox();
  }).catch(() => {});
  return queue;
}

export function prioritizeDropboxGameplay(destination) {
  if (!session()) return () => {};
  const active = { destination };
  playing = active;
  void syncDropbox();
  return () => {
    if (playing !== active) return;
    playing = null;
    void (async () => {
      if (flight) await flight.catch(() => {});
      if (!playing) await syncDropbox();
    })();
  };
}

async function syncAccount(auth, epoch, signal, progress, priority, playback) {
  if (playback) playback.background = false;
  const account = auth.accountId;
  const check = () => {
    signal.throwIfAborted();
    if (epoch !== generation || session()?.accountId !== account || session()?.connectionId !== auth.connectionId) {
      throw new DropboxError("Dropbox disconnected.", "cancelled");
    }
  };
  check();
  await queue.catch(() => {});
  const activity = (transferProgress) => {
    check();
    update({ phase: "syncing", message: "", verified: false,
      transferProgress: transferProgress ?? state.transferProgress });
  };
  const transport = trackCloudTransfers(await createNativeCloudClient(auth, { signal, progress }), activity);
  try {
    const { destinations, sources } = await context();
    const launchDestination = destinations.find(({ key }) => key === priority?.destination);
    const launchProfile = launchDestination && await saveProfileId({ destination: launchDestination });
    const playingDestination = destinations.find(({ key }) => key === playback?.destination);
    const playingProfile = playingDestination && await saveProfileId({ destination: playingDestination });
    const focusProfile = launchProfile ?? playingProfile;
    check();
    syncAccountActivity(transport.activityClient(), auth, sources);
    const historyPrefix = recordKey(account, "history", "");
    const metadata = new Map((await syncStore.all(historyPrefix)).map(({ node }) => [node.id, node]));
    const client = await createSaveCollection(transport, {
      load: (id, revision) => metadata.get(id)?.revision === revision ? metadata.get(id) : undefined,
      async save(node) {
        await syncStore.put({ id: historyPrefix + node.id, node });
        metadata.set(node.id, node);
      },
    });
    check();
    const scanGeneration = localGeneration;
    const scanned = await scanLocalSaves(destinations, client, check);
    check();
    if (client.hasDamagedArchives()) {
      // Only seed empty editions when ancestry cannot be verified. Read any
      // cloud candidates outside the save lock and check again before import.
      const occupiedEditions = (active, incomplete) => new Set([
        ...active.sets.map(set => set.destination.key), ...incomplete.map(entry => entry.destinationKey),
      ]);
      const isUnmatched = entry => !destinations.some(({ key }) => key === entry.destinationKey);
      if (!scanned.busy && !scanned.incomplete.some(isUnmatched)) {
        const occupied = occupiedEditions(scanned.active, scanned.incomplete);
        const rows = [];
        for await (const snapshot of client.verifiedFallbacks()) {
          const set = await withoutEmptyRecords(snapshot);
          if (!set) continue;
          const destinationKey = matchDestination(set, destinations);
          if (!destinationKey || destinationKey === "shared" || occupied.has(destinationKey)) continue;
          occupied.add(destinationKey);
          rows.push({ set, destinationKey, choice: "imported" });
        }
        if (rows.length) await lockedSaves(async storage => {
          check();
          const active = await getActiveSaveSets(storage, destinations);
          const incomplete = readIncompleteSaveWrites(storage, destinations);
          if (incomplete.some(isUnmatched)) return;
          const occupied = occupiedEditions(active, incomplete);
          const imports = rows.filter(row => !occupied.has(row.destinationKey));
          if (!imports.length) return;
          let initialConfig;
          if (!active.hasRoot) {
            const response = await fetch("/scummvm.ini", { signal: AbortSignal.timeout(15000) });
            if (!response.ok) return;
            initialConfig = await response.text();
          }
          check();
          await applyImport({ storage, destinations, rows: imports, revision: active.revision, initialConfig, check });
          window.dispatchEvent(new Event("scummweb:saves-changed"));
        });
      }
      update({ phase: "connected", message: "", verified: false });
      return { retry: false };
    }
    const baselinePrefix = recordKey(account, "base", "");
    const baselines = new Map((await syncStore.all(baselinePrefix)).map(record => [record.id.slice(baselinePrefix.length), record]));
    const preservedHashes = new Set();
    const preservedUnmatched = new Set();
    const groups = new Map();
    const collected = scanned.busy ? scanned : await (async () => {
      const { active, incomplete } = scanned;
      const blocked = new Set();
      for (const entry of incomplete) {
        const destination = destinations.find(({ key }) => key === entry.destinationKey && key !== "shared");
        if (!destination) return { busy: true, incomplete: true };
        const profile = await saveProfileId({ destination });
        blocked.add(profile);
      }
      const stored = await readStoredSets();
      check();
      for (const set of active.sets) {
        const profile = await saveProfileId(set);
        if (blocked.has(profile)) continue;
        const usable = await withoutEmptyRecords(set);
        if (!usable) continue;
        let group = groups.get(profile);
        if (!group) groups.set(profile, group = { local: null, alternatives: [] });
        // An isolated edition is authoritative over a leftover legacy root copy.
        if (group.local && !set.destination.isolated) group.alternatives.push(usable);
        else { if (group.local) group.alternatives.push(group.local); group.local = usable; }
      }
      for (const set of stored) {
        const profile = await saveProfileId(set);
        const identity = `${profile}/${set.hash}`;
        preservedHashes.add(identity);
        if (!matchDestination(set, destinations)) preservedUnmatched.add(identity);
        if (blocked.has(profile)) continue;
        const usable = await withoutEmptyRecords(set);
        if (!usable) continue;
        if (!groups.has(profile)) groups.set(profile, { local: null, alternatives: [] });
        groups.get(profile).alternatives.push(usable);
      }
      for (const [profile, group] of groups) {
        check();
        group.browserSet = group.local;
        // A killed browser can flush IndexedDB and BrowserFS at different times.
        // Never replace a durable outbox with an older browser working copy.
        if (group.local && group.local.hash !== baselines.get(profile)?.hash) {
          await syncStore.putIfAbsent({ id: recordKey(account, "pending", profile), profile, set: group.local });
        }
        // Preserved imports/migration data survive a browser purge as well.
        for (const set of group.alternatives) await syncStore.put({ id: recordKey(account, "preserved", `${profile}/${set.hash}`), profile, set });
      }
      return { busy: false, blocked, revision: active.revision };
    })();
    check();
    for (const item of await syncStore.all(recordKey(account, "pending", ""))) {
      if (collected.blocked?.has(item.profile) || collected.incomplete) continue;
      const set = await withoutEmptyRecords(item.set);
      if (set !== item.set) {
        await preserveSets([item.set]);
        check();
        const stillPending = pending => pending.set.hash === item.set.hash;
        if (set) await syncStore.putIf({ ...item, set }, stillPending);
        else await syncStore.removeIf(item.id, stillPending);
      }
      if (!set) continue;
      if (!groups.has(item.profile)) groups.set(item.profile, { local: null, alternatives: [] });
      groups.get(item.profile).local = set;
    }
    for (const item of await syncStore.all(recordKey(account, "preserved", ""))) {
      const set = await withoutEmptyRecords(item.set);
      if (!set) continue;
      if (!groups.has(item.profile)) groups.set(item.profile, { local: null, alternatives: [] });
      groups.get(item.profile).alternatives.push(set);
    }
    for (const profile of client.profiles()) {
      if (!groups.has(profile)) groups.set(profile, { local: null, alternatives: [] });
    }
    const ordered = new Map();
    if (focusProfile) ordered.set(focusProfile, groups.get(focusProfile) ?? { local: null, alternatives: [] });
    for (const [profile, group] of groups) ordered.set(profile, group);
    const sameHead = (profile, head) => {
      const latest = client.head(profile);
      return latest.active === head.active && latest.tips.join() === head.tips.join();
    };
    const inputFor = (profile, group) => {
      const baseline = baselines.get(profile);
      return { profile, ...group, base: baseline?.hash ?? null, baseTips: baseline?.tips ?? [], check };
    };
    const hasIndependentWorkingCopy = (input) => input.browserSet && input.browserSet.hash !== input.local?.hash
      && input.browserSet.hash !== input.base;
    async function stageBackground() {
      let wrote = false;
      for (const [profile, group] of ordered) {
        check();
        if (profile === focusProfile || collected.blocked?.has(profile)) continue;
        const input = inputFor(profile, group);
        if (!hasIndependentWorkingCopy(input)) wrote = await client.stage(input) || wrote;
      }
      if (wrote) await client.refresh();
    }
    const readyProfiles = new Set();
    const committedHeads = new Map();
    const spaceBlocked = new Set();
    const hasIncomplete = Boolean(collected.incomplete || collected.blocked?.size);
    let deferred = false;
    let deferredMessage = "";
    const playingRestores = new Set();
    async function deferPlayingRestore(profile, head, local) {
      if (local && head.snapshots.includes(local.hash)) {
        await syncStore.removeIf(recordKey(account, "pending", profile), pending => pending.set.hash === local.hash);
      }
      playingRestores.add(profile);
    }
    let stagedBackground = false;
    for (const [profile, group] of ordered) {
      check();
      if (collected.blocked?.has(profile)) continue;
      const focused = profile === focusProfile;
      if (!focused && !stagedBackground) {
        if (playback) playback.background = true;
        await stageBackground();
        stagedBackground = true;
      }
      const input = inputFor(profile, group);
      const baseline = baselines.get(profile);
      const independent = hasIndependentWorkingCopy(input);
      let result = focused || independent ? await client.publish({ ...input, refreshUnchanged: false }) : await client.reconcile(input);
      if (independent) {
        // If the working copy ALSO changed independently, preserve it as an independent branch.
        // Automatic convergence retains both complete local histories.
        group.local = group.browserSet;
        result = await publishProfile({ client, profile, local: group.local, base: baseline?.hash ?? null, baseTips: baseline?.tips ?? [], refreshUnchanged: false, check });
      }
      check();
      for (const hash of result.head.alternatives) {
        const identity = `${profile}/${hash}`;
        if (preservedHashes.has(identity)) continue;
        const alternative = await readSnapshot(client, profile, hash);
        check();
        await preserveSets([alternative]);
        preservedHashes.add(identity);
      }
      const remoteHash = result.head.active;
      if (remoteHash && !preservedUnmatched.has(`${profile}/${remoteHash}`)
        && (result.action === "download" || !collected.busy && remoteHash !== group.browserSet?.hash)) {
        if (collected.busy) {
          if (baseline?.hash !== remoteHash) {
            deferred = true;
            deferredMessage ||= "Close games in other ScummWEB tabs before restoring cloud saves.";
          }
          continue; // Never replace a running game's files.
        }
        const identity = `${profile}/${remoteHash}`;
        if (profile === playingProfile && preservedHashes.has(identity)) {
          const edition = editionKey(playingDestination.namespace, playingDestination.family);
          const locks = await navigator.locks.query?.();
          if (edition && locks?.held.some(lock => lock.name === editionLockName(edition))) {
            check();
            await deferPlayingRestore(profile, result.head, group.local);
            continue;
          }
        }
        const restoreKey = recordKey(account, "restore-space", profile);
        const previous = restoreSpaceWait.get(restoreKey);
        if (previous?.hash === remoteHash && previous.revision === collected.revision && Date.now() < previous.retryAt) {
          spaceBlocked.add(profile);
          continue;
        }
        const remote = await readSnapshot(client, profile, remoteHash);
        check();
        if (hasEmptyBaseballRecords(remote)) {
          await client.recoverBaseballRecords(profile, newestBaseballRecords([group.browserSet, group.local].filter(Boolean)), check);
          return { retry: true };
        }
        let restoreRevision;
        const destinationKey = matchDestination(remote, destinations);
        const destination = destinations.find(({ key }) => key === destinationKey);
        const restoration = lockedSaves(async (storage, scoped) => {
          check();
          for (const entry of readIncompleteSaveWrites(storage, destinations)) {
            const destination = destinations.find(({ key }) => key === entry.destinationKey && key !== "shared");
            if (!destination || await saveProfileId({ destination }) === profile) return { changed: true };
          }
          const current = await getActiveSaveSets(storage, destinations);
          restoreRevision = current.revision;
          const local = current.sets.find((set) => matchDestination(remote, [set.destination]));
          const usable = local && await withoutEmptyRecords(local);
          if (usable && usable.hash !== group.browserSet?.hash) return { changed: true };
          let initialConfig;
          if (destinationKey && !current.hasRoot) {
            const response = await fetch("/scummvm.ini", { signal: AbortSignal.timeout(15000) });
            if (!response.ok) throw new DropboxError("Could not initialize restored saves.");
            initialConfig = await response.text();
          }
          check();
          activity({ stage: "restore", title: remote.destination.title, percentage: 100 });
          await applyImport({ storage, destinations, revision: current.revision, initialConfig, check, scoped: scoped ? destinationKey : undefined,
            rows: [{ set: remote, destinationKey, choice: "imported" }] });
          activity({ stage: "verify", title: remote.destination.title, percentage: 100 });
          return { changed: false, restored: Boolean(destinationKey) && local?.hash !== remote.hash };
        }, { destination }).catch((error) => {
          if (!isQuotaError(error)) throw error;
          restoreSpaceWait.set(restoreKey, { hash: remoteHash, revision: restoreRevision, retryAt: Date.now() + 120000 });
          return { quota: true };
        });
        // Continue can wait for a downloaded save of its own edition to
        // commit before the player takes that edition's lock.
        if (destination) downloadedRestores.set(destination.key, restoration);
        let restored;
        try { restored = await restoration; }
        finally {
          if (destination && downloadedRestores.get(destination.key) === restoration) downloadedRestores.delete(destination.key);
        }
        if (restored.quota) {
          spaceBlocked.add(profile);
          continue;
        }
        if (restored.playing) {
          // Keep the received result and the current player's exact bytes.
          // Leave the old baseline until the local restore can be applied.
          if (!preservedHashes.has(identity)) await preserveSets([remote]);
          check();
          await deferPlayingRestore(profile, result.head, group.local);
          continue;
        }
        if (restored.busy || restored.changed) {
          deferred = true;
          deferredMessage ||= restored.busy ? "Close games in other ScummWEB tabs before restoring cloud saves."
            : "Saves changed on this device during sync. They will be checked again shortly.";
          continue;
        }
        restoreSpaceWait.delete(restoreKey);
        // Preserving an unavailable edition changes no active saves. Announcing
        // it would schedule another pass forever through startDropboxSync.
        if (restored.restored) window.dispatchEvent(new Event("scummweb:saves-changed"));
      }
      await syncStore.put({ id: recordKey(account, "base", profile), hash: result.head.active, tips: result.head.tips });
      await syncStore.removeIf(recordKey(account, "pending", profile), (pending) => pending.set.hash === group.local?.hash);
      readyProfiles.add(profile);
      committedHeads.set(profile, result.head);
      if (profile === launchProfile && !collected.busy && !collected.incomplete && scanGeneration === localGeneration) {
        // Check the selected edition again before letting it start. The
        // account-wide pass still verifies all editions before reporting done.
        await client.refresh();
        check();
        if (client.hasDamagedArchives()) return { retry: true };
        if (!sameHead(profile, result.head)) return { retry: true };
        await queue.catch(() => {});
        const pending = await syncStore.get(recordKey(account, "pending", profile));
        check();
        if (pending || scanGeneration !== localGeneration) return { retry: true };
        priority.ready();
      }
    }
    if (spaceBlocked.size) {
      deferred = true;
      deferredMessage ||= restoreSpaceMessage;
    }
    check();
    // Unchanged profiles share a listing. A final fresh listing fences remote
    // arrivals/deletions before launch, without one network trip per game.
    const cloudChanged = await client.refresh();
    check();
    const reconciliationChanged = client.profiles().some(profile => !ordered.has(profile))
      || [...committedHeads].some(([profile, head]) => !sameHead(profile, head));
    if (cloudChanged || reconciliationChanged) {
      launchSyncSnapshot = null;
      update({ phase: "waiting", conflicts: [],
        message: "Cloud saves changed during sync. Checking them again shortly." });
      return { retry: true };
    }
    const observedGeneration = localGeneration;
    await queue.catch(() => {});
    const pending = await syncStore.all(recordKey(account, "pending", ""));
    if (observedGeneration !== localGeneration) {
      deferred = true;
      deferredMessage ||= "New saves are waiting for the next sync.";
    }
    check();
    // Keep incomplete scans and every pending profile blocked.
    const pendingProfiles = new Set(pending.map((item) => item.profile));
    const scanComplete = !collected.incomplete && observedGeneration === localGeneration;
    launchSyncSnapshot = { epoch, account, localGeneration: observedGeneration,
      complete: !collected.busy && scanComplete, checkEmptyEdition: Boolean(collected.busy && scanComplete),
      incomplete: collected.incomplete, blocked: collected.blocked,
      blockedMessage: !collected.incomplete && collected.busy ? "Finish syncing saved progress and close other ScummWEB games before playing." : "",
      scanned: new Set(groups.keys()), ready: new Set([...readyProfiles].filter((profile) => !pendingProfiles.has(profile))) };
    const pendingOther = pending.some(item => !collected.incomplete && !collected.blocked?.has(item.profile));
    update({ phase: pendingOther || deferred ? "waiting" : "connected", conflicts: [],
      verified: !pending.length && !deferred && !collected.busy && !hasIncomplete && !playingRestores.size,
      message: deferred ? deferredMessage || "Saved progress is waiting to be checked again."
        : pendingOther ? "Your latest saves are waiting to sync." : "" });
    return { retry: !collected.busy && !collected.incomplete
      && (pending.some((item) => !collected.blocked?.has(item.profile) && !spaceBlocked.has(item.profile)) || observedGeneration !== localGeneration) };

  } finally { transport.close(); }
}

async function emptyCatalogEdition(destination) {
  if (destination.namespace || destination.key !== `catalog:${destination.family}` || !navigator.locks) return false;
  const edition = editionKey("", destination.family);
  if (!edition) return false;
  const db = await ensureSaveStorage().catch(() => null);
  if (!db) return false;
  // Other isolated players hold a shared root lock. Read only this edition,
  // excluding legacy-wide operations and a player using this same edition.
  return navigator.locks.request(saveLockName, { mode: "shared", ifAvailable: true }, async (rootLock) => {
    if (!rootLock) return false;
    return navigator.locks.request(editionLockName(edition), { mode: "exclusive", ifAvailable: true }, async (lock) => {
      if (!lock) return false;
      try {
        const storage = await openSaveStorage(db);
        if (readIncompleteSaveWrites(storage).length) return false;
        const { root } = captureFilesystem(storage, true);
        const editions = root.children.get(editionDirectory);
        if (editions && (!editions.children || editions.children.has(edition))) return false;
        let legacy = root;
        for (const part of saveDirectory) {
          if (!legacy) break;
          if (!legacy.children) return false;
          legacy = legacy.children.get(part);
        }
        return !legacy || Boolean(legacy.children)
          && ![...legacy.children.keys()].some((name) => matchesLegacySave(destination.family, name));
      } catch { return false; }
    });
  });
}

async function launchIsVerified(destinationKey) {
  const snapshot = launchSyncSnapshot;
  if (!destinationKey || state.phase !== "waiting" || !snapshot) return false;
  if (snapshot.incomplete) return true;
  const { destinations } = await context();
  const destination = destinations.find((item) => item.key === destinationKey);
  if (!destination) return false;
  const profile = await saveProfileId({ destination });
  const editionPaused = snapshot.blocked?.has(profile);
  // An interrupted write must not prevent loading an intact local checkpoint.
  // The affected edition remains fenced from cloud restore and publication.
  if (editionPaused) return true;
  if (!snapshot.complete && (!snapshot.checkEmptyEdition || snapshot.scanned.has(profile) || !await emptyCatalogEdition(destination))) return false;
  return snapshot === launchSyncSnapshot && snapshot.epoch === generation && snapshot.account === session()?.accountId
    && snapshot.localGeneration === localGeneration
    && (!snapshot.scanned.has(profile) || snapshot.ready.has(profile));
}

export async function syncDropbox({ beforeLaunch = false, launchDestinationKey = null } = {}) {
  if (!dropboxPreviewEnabled()) return;
  if (!connection()?.enabled) { update({ phase: "disconnected", message: "", conflicts: [] }); return; }
  const auth = session();
  if (!auth) {
    const error = new DropboxError("Reconnect Dropbox to sync your saves.", "auth");
    failure(error);
    if (beforeLaunch) throw error;
    return;
  }
  if (beforeLaunch && launchDestinationKey && flight && !flightPriority) {
    // Existing publications are immutable and outbox entries remain durable
    // until acknowledged. Restart a background-only pass with this game first.
    flightController?.abort(new DropboxError("Prioritizing the game being launched.", "priority"));
    await flight.catch(() => {});
    return syncDropbox({ beforeLaunch, launchDestinationKey });
  }
  if (!flight) {
    launchSyncSnapshot = null;
    const epoch = generation;
    const controller = new AbortController();
    flightController = controller;
    const priority = beforeLaunch && launchDestinationKey ? { destination: launchDestinationKey } : null;
    if (priority) {
      priority.waiting = true;
      priority.promise = new Promise(resolve => { priority.ready = () => { priority.waiting = false; resolve(true); }; });
    }
    flightPriority = priority;
    const playback = playing && { destination: playing.destination, background: false };
    flightPlayback = playback;
    let deadline;
    const progress = () => {
      clearTimeout(deadline);
      deadline = setTimeout(() => controller.abort(new DropboxError("Save sync stopped responding. Your copies are retained and will retry automatically.")), 180000);
    };
    progress();
    const aborted = new Promise((_, reject) => controller.signal.addEventListener("abort", () => reject(controller.signal.reason), { once: true }));
    // A check is not a transfer. Keep the last useful connected/error
    // status while listing metadata; beforeLaunch still awaits the full flight.
    update({ checking: true, ...(state.phase === "disconnected" ? { phase: "connected", verified: false } : {}) });
    const work = (async () => {
      if (!navigator.locks) throw new DropboxError("This browser cannot safely coordinate cloud saves.");
      await navigator.locks.request("scummweb-dropbox-sync", { mode: "exclusive", signal: controller.signal }, async (lock) => {
        if (!lock) throw new DropboxError("Another ScummWEB tab is syncing. Try again shortly.");
        controller.signal.throwIfAborted();
        for (let attempt = 0; attempt < 3; attempt++) {
          const result = await Promise.race([syncAccount(auth, epoch, controller.signal, progress, priority, playback), aborted])
            .catch(error => {
              if (error.kind !== "changed") throw error;
              update({ phase: "waiting", message: error.message, verified: false });
              return { retry: true };
            });
          if (!result?.retry || attempt === 2) break;
          controller.signal.throwIfAborted();
          update({ conflicts: [] });
        }
      });
    })();
    flight = Promise.race([work, aborted]).catch((error) => {
      if (controller.signal.aborted) contextPromise = null;
      if (epoch === generation) failure(error);
      throw error;
    })
      .finally(() => {
        clearTimeout(deadline); flight = null; flightPriority = null; flightPlayback = null;
        if (flightController === controller) flightController = null;
        if (epoch === generation) update({ checking: false });
      });
  }
  try {
    const priority = beforeLaunch && launchDestinationKey === flightPriority?.destination ? flightPriority : null;
    if (priority && await Promise.race([flight, priority.promise]) === true) return;
    await flight;
    if (!dropboxPreviewEnabled()) return;
    if (beforeLaunch && state.phase !== "connected" && !await launchIsVerified(launchDestinationKey)) {
      const message = launchDestinationKey && state.phase === "waiting" && !launchSyncSnapshot?.complete
        ? launchSyncSnapshot?.blockedMessage || state.message : state.message;
      throw new DropboxError(message || "Finish syncing before playing.");
    }
  } catch (error) {
    if (beforeLaunch && dropboxPreviewEnabled() && error.kind !== "integrity") throw error;
  }
}

export async function connectDropbox() {
  if (connecting) return;
  if (!appKey()) throw new DropboxError("Dropbox sync has not been configured for this site yet.");
  // Open during the click gesture; populate it after asynchronous PKCE hashing.
  const popup = window.open("about:blank", "scummweb-dropbox", "popup,width=600,height=720");
  if (!popup) throw new DropboxError("Allow the Dropbox sign-in window, then try again.");
  connecting = true;
  update({ phase: "connecting", message: "" });
  try {
    const transaction = await authorizationRequest(appKey(), window.location.origin);
    const code = await new Promise((resolve, reject) => {
      const finish = (error, value) => {
        clearInterval(timer); window.removeEventListener("message", receive);
        if (!popup.closed) popup.close();
        if (error) reject(error); else resolve(value);
      };
      const receive = (event) => {
        if (event.origin !== window.location.origin || event.source !== popup
          || event.data?.type !== "scummweb:dropbox-authorization" || event.data.state !== transaction.state) return;
        finish(event.data.denied || typeof event.data.code !== "string"
          ? new DropboxError("Dropbox connection was cancelled.") : null, event.data.code);
      };
      const expires = Date.now() + 300000;
      const timer = setInterval(() => {
        if (popup.closed || Date.now() > expires) finish(new DropboxError("Dropbox connection was cancelled. Try connecting again."));
      }, 500);
      window.addEventListener("message", receive);
      popup.location.replace(transaction.url);
    });
    const auth = await exchangeCode(appKey(), transaction, code);
    const account = { account_id: auth.accountId };
    const owner = localStorage.getItem(ownerKey);
    if (owner && owner !== account.account_id) throw new DropboxError("These browser saves belong to another Dropbox account. Reconnect that account or use a separate browser profile.");
    localStorage.setItem(ownerKey, account.account_id);
    generation++;
    stopAccountActivity();
    flightController?.abort(new DropboxError("Dropbox connection replaced.", "cancelled"));
    if (flight) await flight.catch(() => {});
    const connectionId = crypto.randomUUID();
    await syncStore.put({ id: credentialKey("dropbox", auth.accountId), config: dropboxNativeConfig(auth, appKey()), connectionId });
    sessionStorage.removeItem(sessionKey);
    localStorage.setItem(connectionKey, JSON.stringify({ enabled: true, accountId: account.account_id, connectionId }));
    window.dispatchEvent(new Event("scummweb:dropbox-connection"));
    await syncDropbox();
  } catch (error) { failure(error); throw error; }
  finally { connecting = false; if (!popup.closed) popup.close(); }
}
export async function disconnectDropbox() {
  generation++;
  stopAccountActivity();
  flightController?.abort(new DropboxError("Dropbox disconnected.", "cancelled"));
  sessionStorage.removeItem(sessionKey);
  const previous = connection();
  localStorage.setItem(connectionKey, JSON.stringify({ ...previous, enabled: false }));
  update({ phase: "disconnected", message: "", conflicts: [], checking: false, verified: false });
  window.dispatchEvent(new Event("scummweb:dropbox-connection"));
  if (previous?.accountId) await syncStore.removeIf(credentialKey("dropbox", previous.accountId),
    (record) => record.connectionId === previous.connectionId);
}

export function startDropboxSync() {
  if (!dropboxPreviewEnabled()) return () => {};
  const retry = () => { if (!document.hidden) void syncDropbox(); };
  let debounce;
  const changed = () => { clearTimeout(debounce); debounce = setTimeout(retry, 750); };
  const storageChanged = (event) => {
    if (event.key === connectionKey) stopAccountActivity();
    if (event.key !== activityCacheKey) changed();
  };
  const timer = setInterval(retry, 30000);
  window.addEventListener("online", retry);
  window.addEventListener("focus", retry);
  document.addEventListener("visibilitychange", retry);
  window.addEventListener("storage", storageChanged);
  window.addEventListener("scummweb:saves-changed", changed);
  retry();
  return () => {
    if (!dropboxPreviewEnabled()) {
      generation++;
      stopAccountActivity();
      launchSyncSnapshot = null;
      flightController?.abort(new DropboxError("Dropbox preview disabled.", "cancelled"));
      update({ phase: "disconnected", message: "", conflicts: [], checking: false, verified: false });
    }
    clearInterval(timer); clearTimeout(debounce);
    window.removeEventListener("online", retry); window.removeEventListener("focus", retry);
    document.removeEventListener("visibilitychange", retry);
    window.removeEventListener("storage", storageChanged); window.removeEventListener("scummweb:saves-changed", changed);
  };
}
