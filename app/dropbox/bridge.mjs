import { connectionKey } from "./client.mjs";
import { readStoredBrowserSave } from "../browser-saves.mjs";
import { cloudSaveStatus, recordSaveAccess, reserveSaveAccess } from "./local-cache.mjs";

function connection() {
  try { return JSON.parse(window.localStorage.getItem(connectionKey)); } catch { return null; }
}

export function dropboxEnabled() {
  return connection()?.enabled === true;
}
export function hasDropboxLaunchState(destination) {
  return Boolean(connection()?.accountId || cloudSaveStatus(destination));
}
export async function prepareDropboxLaunch(launchDestinationKey = null, resumeGame = null, game = resumeGame, signal) {
  const auth = connection();
  if (!auth?.accountId && !cloudSaveStatus(launchDestinationKey)) return;
  const sync = await import("./runtime.mjs");
  const { local, needsRestore } = await reserveSaveAccess(launchDestinationKey, signal, async () => {
    if (auth?.enabled) await recordSaveAccess(auth.accountId, launchDestinationKey).catch(() => {});
    const cloud = await sync.requiresDropboxRestore(launchDestinationKey);
    const slot = game && await readStoredBrowserSave(game).catch(() => null);
    return {
      local: slot != null || cloud && await sync.hasLocalDropboxFiles(launchDestinationKey).catch(() => false),
      needsRestore: cloud,
    };
  });
  const unavailable = "Connect to Dropbox to restore this game’s saves.";
  if (!auth?.enabled || navigator.onLine === false) {
    if (!local && !await sync.restorePendingForLaunch(launchDestinationKey) && needsRestore) throw new Error(unavailable);
    return;
  }
  if (resumeGame && (await sync.waitForDownloadedSave(launchDestinationKey) || local && !needsRestore)) return;
  try {
    await sync.syncDropbox({ beforeLaunch: true, launchDestinationKey });
  } catch (error) {
    if (local) return;
    if (await sync.restorePendingForLaunch(launchDestinationKey)) return;
    throw error;
  }
  if (!local && await sync.requiresDropboxRestore(launchDestinationKey)) {
    if (!await sync.hasLocalDropboxFiles(launchDestinationKey).catch(() => false)) throw new Error(unavailable);
  }
}

export function prioritizeDropboxGameplay(destination) {
  if (!destination || !dropboxEnabled()) return () => {};
  let ended = false, cleanup;
  void import("./runtime.mjs").then(runtime => {
    if (!ended) cleanup = runtime.prioritizeDropboxGameplay(destination);
  }).catch(() => {});
  return () => { ended = true; cleanup?.(); };
}

export function reportDropboxSave(player, game) {
  if (!dropboxEnabled()) return;
  // Copy in this task, before any async hashing/import/network work.
  try {
    const set = capturePlayerSaveSet(player, game);
    if (set) void import("./runtime.mjs").then((sync) => sync.queuePlayerSave(set)).catch(() => {});
  } catch { void import("./runtime.mjs").then((sync) => sync.markWaiting()); }
}
import { capturePlayerSaveSet } from "./player-snapshot.mjs";
