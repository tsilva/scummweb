import { createNativeCloudClient, credentialKey, dropboxNativeConfig } from "../cloud/native-client.mjs";
import { authorizationRequest, connectionKey, DropboxError, exchangeCode, sessionKey } from "./client.mjs";
import { createSaveCollection, publishProfile, readSnapshot, saveProfileId } from "./protocol.mjs";
import { syncStore } from "./store.mjs";
import { discoverLooseSaves, importListingIdentity } from "./loose-import.mjs";
import { applyImport, getActiveSaveSets, getSaveDestinations, identifySet, matchDestination, preserveSets,
  readStoredSets, saveLockName } from "../save-backups/backups.mjs";
import { captureFilesystem } from "../save-backups/filesystem.mjs";
import { readGameSources } from "../game-sources.mjs";

const ownerKey = "scummweb.dropbox-owner.v1";
const listeners = new Set();
let state = { phase: "disconnected", message: "", conflicts: [] };
let flight = null, flightController, queue = Promise.resolve(), generation = 0, contextPromise;
let connecting = false, localGeneration = 0;
let launchSyncSnapshot = null;
const appKey = () => process.env.NEXT_PUBLIC_DROPBOX_APP_KEY || "";
export function dropboxConfigured() { return Boolean(appKey()); }
export function getDropboxState() { return state; }
export function subscribeDropbox(listener) { listeners.add(listener); return () => listeners.delete(listener); }
function update(next) { state = { ...state, ...next }; for (const listener of listeners) listener(); }
export function markWaiting(message = "Your latest saves are on this device and waiting to sync.") {
  update({ phase: "waiting", message });
}
function connection() {
  try { return JSON.parse(localStorage.getItem(connectionKey)); } catch { return null; }
}
function session() { return connection()?.enabled ? connection() : null; }
function failure(error) {
  if (error.kind === "cancelled") return;
  update({ phase: !connection()?.enabled ? "disconnected" : error.kind === "auth" ? "reconnect" : "waiting",
    message: error instanceof DropboxError ? error.message : "Could not sync saves. Your local copies are retained." });
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
  return { destinations: await getSaveDestinations(catalog, sources) };
}
async function lockedSaves(action) {
  if (!navigator.locks) throw new DropboxError("This browser cannot safely coordinate cloud saves.");
  return navigator.locks.request(saveLockName, { mode: "exclusive", ifAvailable: true },
    (lock) => lock ? action() : { busy: true });
}
function ensureCompleteSaves() {
  for (let index = 0; index < localStorage.length; index++) {
    const key = localStorage.key(index);
    if (!key?.startsWith("scummweb.continue.v1:") || key.includes(":agent-")) continue;
    try {
      if (JSON.parse(localStorage.getItem(key))?.pending?.length) {
        throw new DropboxError("An incomplete game save needs attention. Your previous cloud saves are retained.", "incomplete");
      }
    } catch (error) { if (error instanceof DropboxError) throw error; }
  }
}
const recordKey = (account, kind, profile) => `${account}/${kind}/${profile}`;
async function enqueue(account, set) {
  set = { ...set, hash: await identifySet(set) };
  const profile = await saveProfileId(set);
  await syncStore.put({ id: recordKey(account, "pending", profile), set, profile });
}
export function queuePlayerSave(set) {
  const account = connection()?.enabled && connection().accountId;
  if (!account) return Promise.resolve();
  localGeneration++;
  update({ phase: "syncing", message: "" });
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
  const transport = await createNativeCloudClient(auth, { signal, progress });
  try {
    const client = await createSaveCollection(transport, {
      load: async (id) => (await syncStore.get(recordKey(account, "node", id)))?.node,
      save: (node) => syncStore.put({ id: recordKey(account, "node", node.id), node }),
    });
    const { destinations } = await context();
    check();
    const entries = await transport.listImports();
    const inboxIdentity = importListingIdentity(entries, destinations);
    const receipt = await syncStore.get(recordKey(account, "inbox", "processed"));
    const alreadyRead = inboxIdentity && receipt?.identity === inboxIdentity && receipt.hashes?.every((hash) => client.hasImported(hash));
    const imports = alreadyRead ? { sets: [], message: "" } : await discoverLooseSaves(transport, destinations, entries);
    check();
    const copiedHashes = new Set(alreadyRead ? receipt.hashes : imports.sets.map(({ hash }) => hash));
    const fresh = imports.sets.filter((set) => !client.hasImported(set.hash));
    let importMessage = imports.message;
    if (fresh.length) {
      // A directory copy can expose only its first files. Require stable bytes.
      await new Promise((resolve, reject) => {
        const abort = () => { clearTimeout(timer); reject(signal.reason); };
        const timer = setTimeout(() => { signal.removeEventListener("abort", abort); resolve(); }, 2000);
        signal.addEventListener("abort", abort, { once: true });
      });
      check();
      const confirmed = await discoverLooseSaves(transport, destinations);
      importMessage = confirmed.message;
      for (const set of fresh) {
        check();
        if (!confirmed.sets.some((item) => item.hash === set.hash)) {
          importMessage = "Copied saves are still changing. They will be checked again shortly.";
          continue;
        }
        // An independent branch preserves existing progress without choosing
        // a timestamp winner. The ordinary conflict flow reviews both copies.
        await publishProfile({ client, profile: await saveProfileId(set), local: set, check });
      }
    }
    check();
    if (inboxIdentity && !importMessage && imports.sets.every((set) => client.hasImported(set.hash))) {
      await syncStore.put({ id: recordKey(account, "inbox", "processed"), identity: inboxIdentity, hashes: [...copiedHashes] });
    }
    const groups = new Map();
    const collected = await lockedSaves(async () => {
      check();
      try { ensureCompleteSaves(); }
      catch (error) { if (error.kind === "incomplete") return { busy: true, incomplete: true }; throw error; }
      const active = await getActiveSaveSets(localStorage, destinations);
      const stored = await readStoredSets();
      check();
      for (const set of active.sets) {
        const profile = await saveProfileId(set);
        let group = groups.get(profile);
        if (!group) groups.set(profile, group = { local: null, alternatives: [] });
        // An isolated edition is authoritative over a leftover legacy root copy.
        if (group.local && !set.destination.isolated) group.alternatives.push(set);
        else { if (group.local) group.alternatives.push(group.local); group.local = set; }
      }
      for (const set of stored) {
        const profile = await saveProfileId(set);
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
      return { busy: false };
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
    const conflicts = [];
    const readyProfiles = new Set();
    let deferred = Boolean(collected.incomplete || importMessage);
    for (const [profile, group] of groups) {
      check();
      const baseline = await syncStore.get(recordKey(account, "base", profile));
      let result = await publishProfile({ client, profile, ...group, base: baseline?.hash ?? null, baseTips: baseline?.tips ?? [], check });
      if (group.browserSet && group.browserSet.hash !== group.local?.hash && group.browserSet.hash !== baseline?.hash) {
        // If the working copy ALSO changed independently, preserve it and ask.
        // Do not guess which of two durable local histories is newer.
        group.local = group.browserSet;
        result = await publishProfile({ client, profile, local: group.local, base: baseline?.hash ?? null, baseTips: baseline?.tips ?? [], check });
      }
      check();
      const remote = result.head.active ? await readSnapshot(client, profile, result.head.active) : null;
      const alternatives = [];
      for (const hash of result.head.alternatives) alternatives.push(await readSnapshot(client, profile, hash));
      check();
      if (alternatives.length) await preserveSets(alternatives);
      if (result.action === "conflict") {
        group.local = result.conflictLocal;
        await preserveSets([group.local, remote]);
        conflicts.push({ profile, local: group.local, remote, title: group.local.destination.title,
          localLabel: copiedHashes.has(group.local.hash) ? "Copied ScummVM saves" : group.browserSet?.hash === group.local.hash ? "This device" : "Other progress",
          remoteLabel: copiedHashes.has(remote.hash) ? "Copied ScummVM saves" : "Dropbox",
          remoteHash: result.head.active, tips: result.head.tips, canResolve: !collected.busy });
        continue;
      }
      if (remote && (result.action === "download" || !collected.busy && remote.hash !== group.browserSet?.hash)) {
        if (collected.busy) {
          if (baseline?.hash !== remote.hash) deferred = true;
          continue; // Never replace a running game's files.
        }
        const restored = await lockedSaves(async () => {
          check();
          const current = await getActiveSaveSets(localStorage, destinations);
          const local = current.sets.find((set) => matchDestination(remote, [set.destination]));
          if (local && local.hash !== group.browserSet?.hash) return { changed: true };
          let initialConfig;
          if (!captureFilesystem(localStorage).root.key) {
            const response = await fetch("/scummvm.ini", { signal: AbortSignal.timeout(15000) });
            if (!response.ok) throw new DropboxError("Could not initialize restored saves.");
            initialConfig = await response.text();
          }
          check();
          await applyImport({ storage: localStorage, destinations, revision: current.revision, initialConfig, check,
            rows: [{ set: remote, destinationKey: matchDestination(remote, destinations), choice: "imported" }] });
          return { changed: false };
        });
        if (restored.busy || restored.changed) { deferred = true; continue; }
        window.dispatchEvent(new Event("scummweb:saves-changed"));
      }
      await syncStore.put({ id: recordKey(account, "base", profile), hash: result.head.active, tips: result.head.tips });
      await syncStore.removeIf(recordKey(account, "pending", profile), (pending) => pending.set.hash === group.local?.hash);
      readyProfiles.add(profile);
    }
    check();
    const observedGeneration = localGeneration;
    await queue.catch(() => {});
    const pending = await syncStore.all(recordKey(account, "pending", ""));
    if (observedGeneration !== localGeneration) deferred = true;
    check();
    // A conflict elsewhere must not block a game whose own profile finished
    // syncing. Keep unknown/incomplete scans and every pending profile blocked.
    const pendingProfiles = new Set(pending.map((item) => item.profile));
    launchSyncSnapshot = { epoch, account, localGeneration: observedGeneration,
      complete: !collected.busy && !collected.incomplete && !importMessage && observedGeneration === localGeneration,
      scanned: new Set(groups.keys()), ready: new Set([...readyProfiles].filter((profile) => !pendingProfiles.has(profile))) };
    update({ phase: conflicts.length ? "conflict" : pending.length || deferred ? "waiting" : "connected", conflicts,
      message: conflicts.length ? "Choose which saved progress to continue." : importMessage || (deferred ? "Cloud saves will be restored after you exit the game."
        : pending.length ? "Your latest saves are waiting to sync." : "") });
  } finally { transport.close(); }
}

async function launchHasNoConflict(destinationKey) {
  const snapshot = launchSyncSnapshot;
  if (!destinationKey || state.phase !== "conflict" || !snapshot?.complete) return false;
  const { destinations } = await context();
  const destination = destinations.find((item) => item.key === destinationKey);
  if (!destination) return false;
  const profile = await saveProfileId({ destination });
  return snapshot === launchSyncSnapshot && snapshot.epoch === generation && snapshot.account === session()?.accountId
    && snapshot.localGeneration === localGeneration
    && (!snapshot.scanned.has(profile) || snapshot.ready.has(profile));
}

export async function syncDropbox({ beforeLaunch = false, launchDestinationKey = null } = {}) {
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
    update({ phase: "syncing", message: "" });
    const work = (async () => {
      if (!navigator.locks) throw new DropboxError("This browser cannot safely coordinate cloud saves.");
      await navigator.locks.request("scummweb-dropbox-sync", { mode: "exclusive", signal: controller.signal }, async (lock) => {
        if (!lock) throw new DropboxError("Another ScummWEB tab is syncing. Try again shortly.");
        controller.signal.throwIfAborted();
        await Promise.race([syncAccount(auth, epoch, controller.signal, progress), aborted]);
      });
    })();
    flight = Promise.race([work, aborted]).catch((error) => {
      if (controller.signal.aborted) contextPromise = null;
      if (epoch === generation) failure(error);
      throw error;
    })
      .finally(() => { clearTimeout(deadline); flight = null; if (flightController === controller) flightController = null; });
  }
  try {
    await flight;
    if (beforeLaunch && state.phase !== "connected" && !await launchHasNoConflict(launchDestinationKey)) {
      throw new DropboxError(state.message || "Finish syncing before playing.");
    }
  } catch (error) { if (beforeLaunch) throw error; }
}

export async function resolveDropboxConflict(profile, choice) {
  const conflict = state.conflicts.find((item) => item.profile === profile);
  const auth = session(), epoch = generation;
  if (!conflict || !auth || !["local", "remote"].includes(choice)) throw new DropboxError("Reconnect Dropbox and review these saves again.");
  const selected = choice === "local" ? conflict.local : conflict.remote;
  const resolution = await lockedSaves(async () => {
    const check = () => { if (epoch !== generation) throw new DropboxError("Dropbox disconnected.", "cancelled"); };
    const { destinations } = await context();
    const current = await getActiveSaveSets(localStorage, destinations);
    const active = current.sets.find((set) => matchDestination(conflict.local, [set.destination]));
    if (active && ![conflict.local.hash, conflict.remote.hash].includes(active.hash)) throw new DropboxError("Saves changed on this device. Review them again.", "conflict");
    const transport = await createNativeCloudClient(auth);
    let result;
    try {
      const client = await createSaveCollection(transport);
      result = await publishProfile({ client, profile, local: selected,
        alternatives: [conflict.local, conflict.remote], resolve: true, expectedTips: conflict.tips, check });
    } finally { transport.close(); }
    if (result.action === "conflict") throw new DropboxError("Saves changed while you were choosing. Review them again.", "conflict");
    check();
    // The selected cloud set is durable before changing active browser files.
    let initialConfig;
    if (!captureFilesystem(localStorage).root.key) {
      const response = await fetch("/scummvm.ini", { signal: AbortSignal.timeout(15000) });
      if (!response.ok) throw new DropboxError("Could not initialize restored saves.");
      initialConfig = await response.text();
    }
    check();
    await applyImport({ storage: localStorage, destinations, revision: current.revision, initialConfig, check,
      rows: [{ set: selected, destinationKey: matchDestination(selected, destinations), choice: "imported" }] });
    await syncStore.put({ id: recordKey(auth.accountId, "base", profile), hash: selected.hash, tips: result.head.tips });
    await syncStore.removeIf(recordKey(auth.accountId, "pending", profile),
      (pending) => [conflict.local.hash, conflict.remote.hash].includes(pending.set.hash));
  });
  if (resolution?.busy) throw new DropboxError("Exit the game before choosing saved progress.");
  window.dispatchEvent(new Event("scummweb:saves-changed"));
  await syncDropbox({ beforeLaunch: true });
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
  flightController?.abort(new DropboxError("Dropbox disconnected.", "cancelled"));
  sessionStorage.removeItem(sessionKey);
  const previous = connection();
  localStorage.setItem(connectionKey, JSON.stringify({ ...previous, enabled: false }));
  update({ phase: "disconnected", message: "", conflicts: [] });
  window.dispatchEvent(new Event("scummweb:dropbox-connection"));
  if (previous?.accountId) await syncStore.removeIf(credentialKey("dropbox", previous.accountId),
    (record) => record.connectionId === previous.connectionId);
}

export function startDropboxSync() {
  const retry = () => { if (!document.hidden) void syncDropbox(); };
  let debounce;
  const changed = () => { clearTimeout(debounce); debounce = setTimeout(retry, 750); };
  const timer = setInterval(retry, 30000);
  window.addEventListener("online", retry);
  window.addEventListener("focus", retry);
  document.addEventListener("visibilitychange", retry);
  window.addEventListener("storage", changed);
  window.addEventListener("scummweb:saves-changed", changed);
  retry();
  return () => {
    clearInterval(timer); clearTimeout(debounce);
    window.removeEventListener("online", retry); window.removeEventListener("focus", retry);
    document.removeEventListener("visibilitychange", retry);
    window.removeEventListener("storage", changed); window.removeEventListener("scummweb:saves-changed", changed);
  };
}
