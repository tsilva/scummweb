"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { Check, LoaderCircle, Unplug } from "lucide-react";
import { connectDropbox, disconnectDropbox, dropboxConfigured, getDropboxState, subscribeDropbox, syncDropbox } from "../dropbox/runtime.mjs";
import { transferProgressDetails } from "../cloud/transfer-progress.mjs";

const labels = {
  disconnected: "Connect Dropbox", connecting: "Connecting Dropbox…", connected: "Dropbox connected",
  preparing: "Preparing saves…", syncing: "Syncing saves…", reconnect: "Reconnect Dropbox", waiting: "Saves waiting to sync",
};

function DropboxIcon() {
  return <svg className="dropbox-icon" width="24" height="24" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="m6 2 6 4-6 4-6-4 6-4Zm12 0 6 4-6 4-6-4 6-4ZM6 10l6 4-6 4-6-4 6-4Zm12 0 6 4-6 4-6-4 6-4ZM6 19l6-4 6 4-6 4-6-4Z" />
  </svg>;
}

export default function DropboxRow() {
  const state = useSyncExternalStore(subscribeDropbox, getDropboxState, getDropboxState);
  const [disconnecting, setDisconnecting] = useState(false);
  const [notice, setNotice] = useState("");
  const configured = dropboxConfigured();
  const busy = disconnecting || ["connecting", "preparing", "syncing"].includes(state.phase);
  const connected = !["disconnected", "connecting"].includes(state.phase);
  const transfer = !disconnecting && ["syncing"].includes(state.phase) ? transferProgressDetails(state.transferProgress) : null;
  const label = disconnecting ? "Disconnecting…" : labels[state.phase] || labels.waiting;
  useEffect(() => setNotice(""), [state.phase, state.message]);
  async function activate() {
    setNotice("");
    try {
      if (["disconnected", "reconnect"].includes(state.phase)) await connectDropbox();
      else {
        await syncDropbox({ beforeLaunch: true });
      }
    } catch (error) { setNotice(error.message); }
  }
  async function disconnect() {
    setNotice("");
    setDisconnecting(true);
    try { await disconnectDropbox(); }
    catch (error) { setNotice(error.message); }
    finally { setDisconnecting(false); }
  }
  return <div className="settings-action-block dropbox-settings">
    <DropboxIcon />
    <div><h3>Sync saves</h3><p>Sync saves and Recently Played activity through Dropbox.</p></div>
    <div className="dropbox-row">
      <button type="button" className={`dropbox-connect${connected ? "" : " secondary-button settings-wide"}`} aria-label={label} disabled={busy || !configured}
        title={!configured ? "Dropbox sync is not configured for this site yet." : undefined} onClick={activate}>
        <span className="dropbox-status" role="status">
          {busy && <LoaderCircle size={18} className="dropbox-spinner" aria-hidden="true" />}
          <span>{label}</span>
          {!busy && state.phase === "connected" && state.verified && <Check size={18} className="dropbox-check" aria-label="Saves synced" />}
        </span>
      </button>
      {connected && <button type="button" className="dropbox-disconnect" aria-label="Disconnect Dropbox"
        title="Disconnect Dropbox" disabled={disconnecting} onClick={disconnect}>
        <Unplug size={16} aria-hidden="true" />Disconnect
      </button>}
    </div>
    {transfer && <p className="dropbox-progress" role="status">
      {transfer.percentage !== null && <><span className="dropbox-percentage">{transfer.percentage}%</span><span aria-hidden="true"> · </span></>}
      <span className="dropbox-progress-game">{transfer.title}</span><span aria-hidden="true"> · </span><span>{transfer.direction}</span>
    </p>}
    {!busy && (notice || state.message) && <p className="dropbox-notice" role="status">{notice || state.message}</p>}
  </div>;
}
