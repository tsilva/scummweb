import { dropboxPreviewEnabled } from "./feature.mjs";
import { readStoredBrowserSave } from "../browser-saves.mjs";

const key = "scummweb.dropbox-connection.v1";
export function dropboxEnabled() {
  if (!dropboxPreviewEnabled()) return false;
  try { return JSON.parse(window.localStorage.getItem(key))?.enabled === true; } catch { return false; }
}
export async function prepareDropboxLaunch(launchDestinationKey = null, resumeGame = null) {
  if (!dropboxEnabled()) return;
  // Continue can use an intact local checkpoint without waiting for every
  // cloud edition. Completed saves still go through the durable outbox.
  if (resumeGame && await readStoredBrowserSave(resumeGame).catch(() => null) !== null) return;
  const sync = await import("./runtime.mjs");
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
