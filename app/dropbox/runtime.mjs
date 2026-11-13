import { authorizationRequest, connectionKey, createDropboxClient, DropboxError, exchangeCode, readSession, sessionKey } from "./client.mjs";
import { publishProfile, readHead, readSnapshot, saveProfileId } from "./protocol.mjs";
import { syncStore } from "./store.mjs";
import { applyImport, getActiveSaveSets, getSaveDestinations, identifySet, matchDestination, preserveSets,
  readStoredSets, saveLockName } from "../save-backups/backups.mjs";
import { captureFilesystem } from "../save-backups/filesystem.mjs";
import { readGameSources } from "../game-sources.mjs";

const ownerKey = "scummweb.dropbox-owner.v1";
const listeners = new Set();
let state = { phase: "disconnected", message: "", conflicts: [] };
let flight = null, queue = Promise.resolve(), generation = 0, contextPromise;
let connecting = false;
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
function session() {
  const value = readSession(sessionStorage);
  return value && connection()?.enabled && value.accountId === connection().accountId ? value : null;
}
function failure(error) {
  if (error.kind === "cancelled") return;
  update({ phase: error.kind === "auth" ? "reconnect" : "waiting",
    message: error instanceof DropboxError ? error.message : "Could not sync saves. Your local copies are retained." });
}
async function context() {
  if (!contextPromise) contextPromise = (async () => {
    const response = await fetch("/games.json", { cache: "no-cache" });
    if (!response.ok) throw new DropboxError("Could not identify the saved games. Try again shortly.");
    const { games } = await response.json();
    if (!Array.isArray(games)) throw new DropboxError("Could not read game information.");
    return games.map((game) => ({ ...game, displayTitle: game.displayTitle || game.title || game.target }));
  })().catch((error) => { contextPromise = null; throw error; });
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

async function syncAccount(auth, epoch) {
  const account = auth.accountId;
  const check = () => {
    if (epoch !== generation || session()?.accountId !== account) throw new DropboxError("Dropbox disconnected.", "cancelled");
  };
  check();
  await queue;
  const client = createDropboxClient(auth.token);
  const { destinations } = await context();
  const groups = new Map();
  const collected = await lockedSaves(async () => {
    ensureCompleteSaves();
    const active = await getActiveSaveSets(localStorage, destinations);
    const stored = await readStoredSets();
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
      if (group.local) await enqueue(account, group.local);
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
  for (const path of await client.listHeads()) {
    const profile = path.split("/")[3];
    if (!groups.has(profile)) groups.set(profile, { local: null, alternatives: [] });
  }
  const conflicts = [];
  for (const [profile, group] of groups) {
    check();
    const baseline = await syncStore.get(recordKey(account, "base", profile));
    const result = await publishProfile({ client, profile, ...group, base: baseline?.hash ?? null, check });
    check();
    const remote = result.head.active ? await readSnapshot(client, profile, result.head.active) : null;
    const alternatives = [];
    for (const hash of result.head.alternatives) alternatives.push(await readSnapshot(client, profile, hash));
    check();
    if (alternatives.length) await preserveSets(alternatives);
    if (result.action === "conflict") {
      await preserveSets([group.local, remote]);
      conflicts.push({ profile, local: group.local, remote, title: group.local.destination.title,
        remoteHash: result.head.active, canResolve: !collected.busy });
      continue;
    }
    if (remote && result.action === "download") {
      if (collected.busy) continue; // Never replace a running game's files.
      const restored = await lockedSaves(async () => {
        check();
        const current = await getActiveSaveSets(localStorage, destinations);
        const local = current.sets.find((set) => matchDestination(remote, [set.destination]));
        if (local && local.hash !== group.local?.hash) return { changed: true };
        let initialConfig;
        if (!captureFilesystem(localStorage).root.key) {
          const response = await fetch("/scummvm.ini");
          if (!response.ok) throw new DropboxError("Could not initialize restored saves.");
          initialConfig = await response.text();
        }
        check();
        await applyImport({ storage: localStorage, destinations, revision: current.revision, initialConfig,
          rows: [{ set: remote, destinationKey: matchDestination(remote, destinations), choice: "imported" }] });
        return { changed: false };
      });
      if (restored.busy || restored.changed) continue;
      window.dispatchEvent(new Event("scummweb:saves-changed"));
    }
    await syncStore.put({ id: recordKey(account, "base", profile), hash: result.head.active });
    const pending = await syncStore.get(recordKey(account, "pending", profile));
    if (pending?.set.hash === group.local?.hash) await syncStore.remove(pending.id);
  }
  check();
  const pending = await syncStore.all(recordKey(account, "pending", ""));
  update({ phase: conflicts.length ? "conflict" : pending.length ? "waiting" : "connected", conflicts,
    message: conflicts.length ? "Choose which saved progress to continue." : pending.length ? "Your latest saves are waiting to sync." : "" });
}

export async function syncDropbox({ beforeLaunch = false } = {}) {
  if (!connection()?.enabled) return;
  const auth = session();
  if (!auth) {
    const error = new DropboxError("Reconnect Dropbox to sync your saves.", "auth");
    failure(error);
    if (beforeLaunch) throw error;
    return;
  }
  if (!flight) {
    const epoch = generation;
    update({ phase: "syncing", message: "" });
    flight = (async () => {
      if (!navigator.locks) throw new DropboxError("This browser cannot safely coordinate cloud saves.");
      await navigator.locks.request("scummweb-dropbox-sync", { mode: "exclusive", ifAvailable: true }, async (lock) => {
        if (!lock) throw new DropboxError("Another ScummWEB tab is syncing. Try again shortly.");
        await syncAccount(auth, epoch);
      });
    })().catch((error) => { if (epoch === generation) failure(error); throw error; }).finally(() => { flight = null; });
  }
  try {
    await flight;
    if (beforeLaunch && state.phase !== "connected") throw new DropboxError(state.message || "Finish syncing before playing.");
  } catch (error) { if (beforeLaunch) throw error; }
}

export async function resolveDropboxConflict(profile, choice) {
  const conflict = state.conflicts.find((item) => item.profile === profile);
  const auth = session(), epoch = generation;
  if (!conflict || !auth) throw new DropboxError("Reconnect Dropbox and review these saves again.");
  const selected = choice === "local" ? conflict.local : conflict.remote;
  await lockedSaves(async () => {
    const check = () => { if (epoch !== generation) throw new DropboxError("Dropbox disconnected.", "cancelled"); };
    await publishProfile({ client: createDropboxClient(auth.token), profile, local: selected,
      alternatives: [conflict.local, conflict.remote], resolve: true, expectedRemote: conflict.remoteHash, check });
    check();
    // The selected cloud set is durable before changing active browser files.
    const { destinations } = await context();
    const current = await getActiveSaveSets(localStorage, destinations);
    await applyImport({ storage: localStorage, destinations, revision: current.revision,
      rows: [{ set: selected, destinationKey: matchDestination(selected, destinations), choice: "imported" }] });
    await syncStore.put({ id: recordKey(auth.accountId, "base", profile), hash: selected.hash });
    const pending = await syncStore.get(recordKey(auth.accountId, "pending", profile));
    if (pending?.set.hash === conflict.local.hash) await syncStore.remove(pending.id);
  });
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
    const account = await createDropboxClient(auth.token).account();
    if (typeof account.account_id !== "string") throw new DropboxError("Could not identify the connected Dropbox account.");
    const owner = localStorage.getItem(ownerKey);
    if (owner && owner !== account.account_id) throw new DropboxError("These browser saves belong to another Dropbox account. Reconnect that account or use a separate browser profile.");
    localStorage.setItem(ownerKey, account.account_id);
    sessionStorage.setItem(sessionKey, JSON.stringify({ ...auth, accountId: account.account_id }));
    localStorage.setItem(connectionKey, JSON.stringify({ enabled: true, accountId: account.account_id }));
    generation++;
    await syncDropbox();
  } catch (error) { failure(error); throw error; }
  finally { connecting = false; if (!popup.closed) popup.close(); }
}
export function disconnectDropbox() {
  generation++;
  sessionStorage.removeItem(sessionKey);
  const previous = connection();
  localStorage.setItem(connectionKey, JSON.stringify({ ...previous, enabled: false }));
  update({ phase: "disconnected", message: "", conflicts: [] });
}

export function startDropboxSync() {
  const retry = () => { if (!document.hidden) void syncDropbox(); };
  let debounce;
  const changed = () => { clearTimeout(debounce); debounce = setTimeout(retry, 750); };
  const timer = setInterval(retry, 30000);
  window.addEventListener("online", retry);
  window.addEventListener("focus", retry);
  window.addEventListener("storage", changed);
  window.addEventListener("scummweb:saves-changed", changed);
  retry();
  return () => {
    clearInterval(timer); clearTimeout(debounce);
    window.removeEventListener("online", retry); window.removeEventListener("focus", retry);
    window.removeEventListener("storage", changed); window.removeEventListener("scummweb:saves-changed", changed);
  };
}
