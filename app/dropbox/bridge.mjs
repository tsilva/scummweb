import { dropboxPreviewEnabled } from "./feature.mjs";

const key = "scummweb.dropbox-connection.v1";
export function dropboxEnabled() {
  if (!dropboxPreviewEnabled()) return false;
  try { return JSON.parse(window.localStorage.getItem(key))?.enabled === true; } catch { return false; }
}
export async function prepareDropboxLaunch(launchDestinationKey = null) {
  if (!dropboxEnabled()) return;
  const sync = await import("./runtime.mjs");
  await sync.syncDropbox({ beforeLaunch: true, launchDestinationKey });
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
