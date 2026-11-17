"use client";

import { useEffect, useState } from "react";
import { dropboxEnabled } from "./dropbox/bridge.mjs";
import DropboxPreview from "./home-shell/dropbox-preview";

export default function DropboxSaveSync() {
  const [state, setState] = useState(null);
  useEffect(() => {
    let stopped = false, cleanup, unsubscribe;
    async function start() {
      if (!dropboxEnabled() || cleanup) return;
      const runtime = await import("./dropbox/runtime.mjs");
      if (stopped || cleanup) return;
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
  return state && ["waiting", "reconnect"].includes(state.phase) ? <DropboxPreview><aside className="dropbox-sync-warning" role="status">
    {state.phase === "reconnect" ? "Reconnect Dropbox in Settings to protect your latest saves." : "Latest saves are on this device, waiting to sync."}
  </aside></DropboxPreview> : null;
}
