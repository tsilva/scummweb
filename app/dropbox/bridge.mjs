import { connectionKey } from "./client.mjs";
import { readStoredBrowserSave } from "../browser-saves.mjs";

export function dropboxEnabled() {
  try { return JSON.parse(window.localStorage.getItem(connectionKey))?.enabled === true; } catch { return false; }
}
export async function prepareDropboxLaunch(launchDestinationKey = null, resumeGame = null) {
  if (!dropboxEnabled()) return;
  const sync = await import("./runtime.mjs");
  if (resumeGame) {
    const local = await readStoredBrowserSave(resumeGame).catch(() => null);
    const restored = await sync.waitForDownloadedSave(launchDestinationKey);
    if (restored || local !== null) return;
  }
  await sync.syncDropbox({ beforeLaunch: true, launchDestinationKey });
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
