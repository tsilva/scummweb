const key = "scummweb.dropbox-connection.v1";
export function dropboxEnabled() {
  try { return JSON.parse(window.localStorage.getItem(key))?.enabled === true; } catch { return false; }
}
export async function prepareDropboxLaunch() {
  if (!dropboxEnabled()) return;
  const sync = await import("./runtime.mjs");
  await sync.syncDropbox({ beforeLaunch: true });
}
export function reportDropboxSave(player, game) {
  if (!dropboxEnabled()) return;
  // Copy in this task, before any async hashing/import/network work.
  void import("./player-snapshot.mjs").then(({ capturePlayerSaveSet }) => {
    const set = capturePlayerSaveSet(player, game);
    if (set) return import("./runtime.mjs").then((sync) => sync.queuePlayerSave(set));
  }).catch(() => import("./runtime.mjs").then((sync) => sync.markWaiting()));
}
