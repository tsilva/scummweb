"use client";

import { useEffect, useState } from "react";
import { dropboxEnabled } from "./dropbox/bridge.mjs";

export default function DropboxSaveSync() {
  const [state, setState] = useState(null);
  useEffect(() => {
    let stopped = false, cleanup, unsubscribe;
    async function start() {
      if (!dropboxEnabled() || cleanup) return;
      const runtime = await import("./dropbox/runtime.mjs");
      if (stopped || cleanup || !dropboxEnabled()) return;
      const refresh = () => setState(runtime.getDropboxState());
      unsubscribe = runtime.subscribeDropbox(refresh);
      cleanup = runtime.startDropboxSync();
      refresh();
    }
    void start();
    window.addEventListener("scummweb:dropbox-connection", start);
    window.addEventListener("storage", start);
    return () => { stopped = true; cleanup?.(); unsubscribe?.(); window.removeEventListener("scummweb:dropbox-connection", start); window.removeEventListener("storage", start); };
  }, []);
  const warning = state?.phase === "reconnect" ? "Reconnect Dropbox in Settings to protect your latest saves."
    : state?.phase === "waiting" ? "Latest saves are on this device, waiting to sync."
    : state?.activityWaiting ? "Play activity is waiting to sync with Dropbox." : null;
  return warning ? <aside className="dropbox-sync-warning" role="status">{warning}</aside> : null;
}
