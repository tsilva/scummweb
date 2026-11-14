"use client";

import { useState, useSyncExternalStore } from "react";
import { Check, MoreHorizontal } from "lucide-react";
import { connectDropbox, disconnectDropbox, dropboxConfigured, getDropboxState, subscribeDropbox, syncDropbox } from "../dropbox/runtime.mjs";

const labels = {
  disconnected: "Connect Dropbox", connecting: "Connecting Dropbox…", connected: "Dropbox connected",
  syncing: "Syncing saves…", reconnect: "Reconnect Dropbox", waiting: "Saves waiting to sync", conflict: "Choose saved progress",
};

function DropboxIcon() {
  return <svg className="dropbox-icon" width="24" height="24" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="m6 2 6 4-6 4-6-4 6-4Zm12 0 6 4-6 4-6-4 6-4ZM6 10l6 4-6 4-6-4 6-4Zm12 0 6 4-6 4-6-4 6-4ZM6 19l6-4 6 4-6 4-6-4Z" />
  </svg>;
}

export default function DropboxRow() {
  const state = useSyncExternalStore(subscribeDropbox, getDropboxState, getDropboxState);
  const [menu, setMenu] = useState(false);
  const [notice, setNotice] = useState("");
  const configured = dropboxConfigured();
  const busy = state.phase === "connecting" || state.phase === "syncing";
  const connected = !["disconnected", "connecting"].includes(state.phase);
  async function activate() {
    setNotice("");
    try {
      if (["disconnected", "reconnect"].includes(state.phase)) await connectDropbox();
      else {
        if (state.phase === "conflict") window.dispatchEvent(new Event("scummweb:dropbox-review"));
        await syncDropbox({ beforeLaunch: true });
      }
    } catch (error) { setNotice(error.message); }
  }
  return <div className="dropbox-settings">
    <div className="dropbox-row">
      <DropboxIcon />
      <button type="button" className="dropbox-connect" disabled={busy || !configured}
        title={!configured ? "Dropbox sync is not configured for this site yet." : undefined} onClick={activate}>
        {labels[state.phase] || labels.waiting}
        {state.phase === "connected" && <Check size={18} className="dropbox-check" aria-label="Saves synced" />}
      </button>
      {connected && <button type="button" className="dropbox-menu-button" aria-label="Dropbox options" aria-expanded={menu}
        aria-controls="dropbox-options" onClick={() => setMenu(!menu)}><MoreHorizontal size={22} /></button>}
    </div>
    {menu && <div id="dropbox-options" className="dropbox-options">
      <button type="button" onClick={async () => {
        try { await disconnectDropbox(); setMenu(false); } catch (error) { setNotice(error.message); }
      }}>Disconnect Dropbox</button>
      <p>Cloud saves stay in Dropbox. Any pending saves remain on this device.</p>
    </div>}
    {(notice || state.message) && <p className="dropbox-notice" role="status">{notice || state.message}</p>}
  </div>;
}
