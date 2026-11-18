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
import { captureFilesystem } from "../save-backups/filesystem.mjs";
import { isEmptyBaseballRecordsWrite, readIncompleteSaveWrites } from "../save-backups/incomplete-writes.mjs";
import { readGameSources } from "../game-sources.mjs";
import { editionDirectory, editionKey, editionLockName, matchesLegacySave, saveDirectory } from "../../web-shell/save-editions.mjs";

const ownerKey = "scummweb.dropbox-owner.v1";
const listeners = new Set();
let state = { phase: "disconnected", message: "", conflicts: [], checking: false, verified: false, transferProgress: null };
let flight = null, flightController, queue = Promise.resolve(), generation = 0, contextPromise;
let connecting = false, localGeneration = 0;
let launchSyncSnapshot = null;
let activityController;
const appKey = () => process.env.NEXT_PUBLIC_DROPBOX_APP_KEY || "";
export function dropboxConfigured() { return Boolean(appKey()); }
export function getDropboxState() { return state; }
export function subscribeDropbox(listener) { listeners.add(listener); return () => listeners.delete(listener); }
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
  if (error.kind === "cancelled") return;
  update({ phase: !connection()?.enabled ? "disconnected" : error.kind === "auth" ? "reconnect" : "waiting",
    message: error instanceof DropboxError ? error.message : "Could not sync saves. Your local copies are retained.", verified: false });
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
async function lockedSaves(action) {
  if (!navigator.locks) throw new DropboxError("This browser cannot safely coordinate cloud saves.");
  return navigator.locks.request(saveLockName, { mode: "exclusive", ifAvailable: true },
    (lock) => lock ? action() : { busy: true });
}
const incompleteSaveMessage = "An incomplete game save needs attention. Your previous cloud saves are retained.";
// Baselines and cached nodes belong to this storage layout and snapshot format.
const recordKey = (account, kind, profile) => `${account}/saves-v1/${kind}/${profile}`;
async function enqueue(account, set) {
  set = { ...set, hash: await identifySet(set) };
  const profile = await saveProfileId(set);
  await syncStore.put({ id: recordKey(account, "pending", profile), set, profile });
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
  void queue.then(() => syncDropbox()).catch(() => {});
  return queue;
}

async function syncAccount(auth, epoch, signal, progress) {
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
    update({ phase: "syncing", message: "", verified: false, transferProgress });
  };
  const transport = trackCloudTransfers(await createNativeCloudClient(auth, { signal, progress }), activity);
  try {
    const { destinations, sources } = await context();
    check();
    syncAccountActivity(transport.activityClient(), auth, sources);
    const client = await createSaveCollection(transport, {
      load: async (id) => (await syncStore.get(recordKey(account, "node", id)))?.node,
      save: (node) => syncStore.put({ id: recordKey(account, "node", node.id), node }),
    });
    check();
    const groups = new Map();
    const collected = await lockedSaves(async () => {
      check();
      const active = await getActiveSaveSets(localStorage, destinations);
      const incomplete = readIncompleteSaveWrites(localStorage, destinations, active.sets);
      const blocked = new Set();
      const localOnly = new Set();
      const requiresRecovery = new Set();
      for (const entry of incomplete) {
        const destination = destinations.find(({ key }) => key === entry.destinationKey && key !== "shared");
        if (!destination) return { busy: true, incomplete: true };
        const profile = await saveProfileId({ destination });
        blocked.add(profile);
        // Only permit local launch for the exact observed empty auxiliary file,
        // and only if no other unfinished file shares this cloud profile.
        if (isEmptyBaseballRecordsWrite(entry)) localOnly.add(profile);
        else requiresRecovery.add(profile);
      }
      for (const profile of requiresRecovery) localOnly.delete(profile);
      const stored = await readStoredSets();
      check();
      for (const set of active.sets) {
        const profile = await saveProfileId(set);
        if (blocked.has(profile)) continue;
        let group = groups.get(profile);
        if (!group) groups.set(profile, group = { local: null, alternatives: [] });
        // An isolated edition is authoritative over a leftover legacy root copy.
        if (group.local && !set.destination.isolated) group.alternatives.push(set);
        else { if (group.local) group.alternatives.push(group.local); group.local = set; }
      }
      for (const set of stored) {
        const profile = await saveProfileId(set);
        if (blocked.has(profile)) continue;
        if (!groups.has(profile)) groups.set(profile, { local: null, alternatives: [] });
        groups.get(profile).alternatives.push(set);
      }
      for (const [profile, group] of groups) {
        check();
        group.browserSet = group.local;
        // A killed browser can flush IndexedDB and BrowserFS at different times.
        // Never replace a durable outbox with an older browser working copy.
        const pending = await syncStore.get(recordKey(account, "pending", profile));
        check();
        if (group.local && !pending) await enqueue(account, group.local);
        // Preserved imports/migration data survive a browser purge as well.
        for (const set of group.alternatives) await syncStore.put({ id: recordKey(account, "preserved", `${profile}/${set.hash}`), profile, set });
      }
      return { busy: false, blocked, localOnly };
    });
    check();
    for (const item of await syncStore.all(recordKey(account, "pending", ""))) {
      if (!groups.has(item.profile)) groups.set(item.profile, { local: null, alternatives: [] });
      groups.get(item.profile).local = item.set;
    }
    for (const item of await syncStore.all(recordKey(account, "preserved", ""))) {
      if (!groups.has(item.profile)) groups.set(item.profile, { local: null, alternatives: [] });
      groups.get(item.profile).alternatives.push(item.set);
    }
    for (const profile of client.profiles()) {
      if (!groups.has(profile)) groups.set(profile, { local: null, alternatives: [] });
    }
    const readyProfiles = new Set();
    const hasIncomplete = Boolean(collected.incomplete || collected.blocked?.size);
    let deferred = hasIncomplete;
    let deferredMessage = hasIncomplete ? incompleteSaveMessage : "";
    for (const [profile, group] of groups) {
      check();
      if (collected.blocked?.has(profile)) continue;
      const baseline = await syncStore.get(recordKey(account, "base", profile));
      let result = await publishProfile({ client, profile, ...group, base: baseline?.hash ?? null, baseTips: baseline?.tips ?? [], refreshUnchanged: false, check });
      if (group.browserSet && group.browserSet.hash !== group.local?.hash && group.browserSet.hash !== baseline?.hash) {
        // If the working copy ALSO changed independently, preserve it as an independent branch.
        // Automatic convergence retains both complete local histories.
        group.local = group.browserSet;
        result = await publishProfile({ client, profile, local: group.local, base: baseline?.hash ?? null, baseTips: baseline?.tips ?? [], refreshUnchanged: false, check });
      }
      check();
      const remote = result.head.active ? await readSnapshot(client, profile, result.head.active) : null;
      const alternatives = [];
      for (const hash of result.head.alternatives) alternatives.push(await readSnapshot(client, profile, hash));
      check();
      if (alternatives.length) await preserveSets(alternatives);
      if (remote && (result.action === "download" || !collected.busy && remote.hash !== group.browserSet?.hash)) {
        if (collected.busy) {
          if (baseline?.hash !== remote.hash) {
            deferred = true;
            deferredMessage ||= "Close games in other ScummWEB tabs before restoring cloud saves.";
          }
          continue; // Never replace a running game's files.
        }
        const restored = await lockedSaves(async () => {
          check();
          const destinationKey = matchDestination(remote, destinations);
          for (const entry of readIncompleteSaveWrites(localStorage, destinations)) {
            const destination = destinations.find(({ key }) => key === entry.destinationKey && key !== "shared");
            if (!destination || await saveProfileId({ destination }) === profile) return { changed: true };
          }
          const current = await getActiveSaveSets(localStorage, destinations);
          const local = current.sets.find((set) => matchDestination(remote, [set.destination]));
          if (local && local.hash !== group.browserSet?.hash) return { changed: true };
          let initialConfig;
          if (destinationKey && !captureFilesystem(localStorage).root.key) {
            const response = await fetch("/scummvm.ini", { signal: AbortSignal.timeout(15000) });
            if (!response.ok) throw new DropboxError("Could not initialize restored saves.");
            initialConfig = await response.text();
          }
          check();
          activity({ stage: "restore", title: remote.destination.title, percentage: 100 });
          await applyImport({ storage: localStorage, destinations, revision: current.revision, initialConfig, check,
            rows: [{ set: remote, destinationKey, choice: "imported" }] });
          activity({ stage: "verify", title: remote.destination.title, percentage: 100 });
          return { changed: false, restored: Boolean(destinationKey) && local?.hash !== remote.hash };
        });
        if (restored.busy || restored.changed) {
          deferred = true;
          deferredMessage ||= restored.busy ? "Close games in other ScummWEB tabs before restoring cloud saves."
            : "Saves changed on this device during sync. They will be checked again shortly.";
          continue;
        }
        // Preserving an unavailable edition changes no active saves. Announcing
        // it would schedule another pass forever through startDropboxSync.
        if (restored.restored) window.dispatchEvent(new Event("scummweb:saves-changed"));
      }
      await syncStore.put({ id: recordKey(account, "base", profile), hash: result.head.active, tips: result.head.tips });
      await syncStore.removeIf(recordKey(account, "pending", profile), (pending) => pending.set.hash === group.local?.hash);
      readyProfiles.add(profile);
    }
    check();
    // Unchanged profiles share a listing. A final fresh listing fences remote
    // arrivals/deletions before launch, without one network trip per game.
    const cloudChanged = await client.refresh();
    check();
    if (cloudChanged) {
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
      blocked: collected.blocked, localOnly: collected.localOnly,
      blockedMessage: (hasIncomplete ? incompleteSaveMessage
        : collected.busy ? "Finish syncing saved progress and close other ScummWEB games before playing." : ""),
      scanned: new Set(groups.keys()), ready: new Set([...readyProfiles].filter((profile) => !pendingProfiles.has(profile))) };
    update({ phase: pending.length || deferred ? "waiting" : "connected", conflicts: [],
      verified: !pending.length && !deferred && !collected.busy,
      message: deferred ? deferredMessage || "Saved progress is waiting to be checked again."
        : pending.length ? "Your latest saves are waiting to sync." : "" });
    return { retry: !collected.busy && !collected.incomplete
      && (pending.some((item) => !collected.blocked?.has(item.profile)) || observedGeneration !== localGeneration) };

  } finally { transport.close(); }
}

async function emptyCatalogEdition(destination) {
  if (destination.namespace || destination.key !== `catalog:${destination.family}` || !navigator.locks) return false;
  const edition = editionKey("", destination.family);
  if (!edition) return false;
  // Other isolated players hold a shared root lock. Read only this edition,
  // excluding legacy-wide operations and a player using this same edition.
  return navigator.locks.request(saveLockName, { mode: "shared", ifAvailable: true }, async (rootLock) => {
    if (!rootLock) return false;
    return navigator.locks.request(editionLockName(edition), { mode: "exclusive", ifAvailable: true }, (lock) => {
      if (!lock) return false;
      try {
        if (readIncompleteSaveWrites(localStorage).length) return false;
        const { root } = captureFilesystem(localStorage, true);
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
  const { destinations } = await context();
  const destination = destinations.find((item) => item.key === destinationKey);
  if (!destination) return false;
  const profile = await saveProfileId({ destination });
  const editionPaused = snapshot.blocked?.has(profile);
  if (editionPaused && !snapshot.localOnly?.has(profile)) return false;
  if (!snapshot.complete && (!snapshot.checkEmptyEdition || snapshot.scanned.has(profile) || !await emptyCatalogEdition(destination))) return false;
  return snapshot === launchSyncSnapshot && snapshot.epoch === generation && snapshot.account === session()?.accountId
    && snapshot.localGeneration === localGeneration
    && (editionPaused || !snapshot.scanned.has(profile) || snapshot.ready.has(profile));
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
  if (!flight) {
    launchSyncSnapshot = null;
    const epoch = generation;
    const controller = new AbortController();
    flightController = controller;
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
          const result = await Promise.race([syncAccount(auth, epoch, controller.signal, progress), aborted]);
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
        clearTimeout(deadline); flight = null;
        if (flightController === controller) flightController = null;
        if (epoch === generation) update({ checking: false });
      });
  }
  try {
    await flight;
    if (!dropboxPreviewEnabled()) return;
    if (beforeLaunch && state.phase !== "connected" && !await launchIsVerified(launchDestinationKey)) {
      const message = launchDestinationKey && state.phase === "waiting" && !launchSyncSnapshot?.complete
        ? launchSyncSnapshot?.blockedMessage || state.message : state.message;
      throw new DropboxError(message || "Finish syncing before playing.");
    }
  } catch (error) { if (beforeLaunch && dropboxPreviewEnabled()) throw error; }
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
