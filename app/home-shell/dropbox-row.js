"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { Check, LoaderCircle } from "lucide-react";
import { connectDropbox, disconnectDropbox, dropboxConfigured, getDropboxState, subscribeDropbox } from "../dropbox/runtime.mjs";
import { transferProgressDetails } from "../cloud/transfer-progress.mjs";

const labels = {
  disconnected: "New saves are stored on this device.", connecting: "Connecting…", disconnecting: "Disconnecting…",
  preparing: "Preparing saves…", syncing: "Syncing saves…", reconnect: "Dropbox needs to be reconnected",
  waiting: "Saves waiting to sync",
};

function subscribeConnectivity(listener) {
  window.addEventListener("online", listener);
  window.addEventListener("offline", listener);
  return () => {
    window.removeEventListener("online", listener);
    window.removeEventListener("offline", listener);
  };
}

function isOnline() {
  return navigator.onLine !== false;
}

function DropboxIcon() {
  return <svg className="dropbox-icon" width="24" height="24" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="m6 2 6 4-6 4-6-4 6-4Zm12 0 6 4-6 4-6-4 6-4ZM6 10l6 4-6 4-6-4 6-4Zm12 0 6 4-6 4-6-4 6-4ZM6 19l6-4 6 4-6 4-6-4Z" />
  </svg>;
}

export default function DropboxRow() {
  const state = useSyncExternalStore(subscribeDropbox, getDropboxState, getDropboxState);
  const online = useSyncExternalStore(subscribeConnectivity, isOnline, () => true);
  const [disconnecting, setDisconnecting] = useState(false);
  const [notice, setNotice] = useState("");
  const configured = dropboxConfigured();
  const phase = disconnecting ? "disconnecting" : state.phase;
  const connected = !["disconnected", "connecting"].includes(phase);
  const reconnect = phase === "reconnect";
  const showConnect = !connected || reconnect;
  const offline = !online && connected && !reconnect && !disconnecting;
  const busy = !offline && ["connecting", "preparing", "syncing", "disconnecting"].includes(phase);
  const upToDate = !offline && phase === "connected" && state.verified;
  const transfer = !offline && phase === "syncing" ? transferProgressDetails(state.transferProgress) : null;
  let label = labels[phase] || (state.checking ? "Checking saves…" : "Connected");
  if (offline) label = "Offline · New saves stay on this device";
  if (upToDate) label = "Saves up to date";

  let description = "";
  if (phase === "disconnected") {
    if (!configured) description = "Dropbox sync is unavailable.";
    else if (!online) description = "Go online to connect Dropbox.";
    else description = "Connect to sync your saves and Recently Played activity to your Dropbox app folder.";
  } else if (offline) {
    description = "Sync resumes automatically when you’re back online.";
  } else if (reconnect && !online) {
    description = "Go online to reconnect Dropbox.";
  }

  const message = !busy && (notice || (!offline && state.message));
  useEffect(() => setNotice(""), [state.phase, state.message]);
  async function connect() {
    setNotice("");
    try { await connectDropbox(); }
    catch (error) { setNotice(error.message); }
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
    <div>
      <h3>Dropbox sync</h3>
      <div role="status">
        <p className="dropbox-status" data-state={offline || reconnect || phase === "waiting" ? "attention" : phase}>
          {busy && <LoaderCircle size={18} className="dropbox-spinner" aria-hidden="true" />}
          {upToDate && <Check size={16} className="dropbox-check" aria-hidden="true" />}
          {label}
        </p>
        {description && <p>{description}
          {phase === "disconnected" && configured && online && (
            <> <a href="/privacy#dropbox-sync">Privacy details</a></>
          )}
        </p>}
        {message && <p className="dropbox-notice">{message}</p>}
      </div>
      {transfer && <p className="dropbox-progress" role="status">
        {transfer.percentage !== null && <><span className="dropbox-percentage">{transfer.percentage}%</span><span aria-hidden="true"> · </span></>}
        <span className="dropbox-progress-game">{transfer.title}</span><span aria-hidden="true"> · </span><span>{transfer.direction}</span>
      </p>}
    </div>
    <div className="dropbox-actions">
      {showConnect && <button type="button" className="secondary-button" aria-label={reconnect ? undefined : "Connect Dropbox"}
        disabled={busy || !configured || !online} onClick={connect}>{reconnect ? "Reconnect Dropbox" : "Connect"}</button>}
      {connected && <button type="button" className="secondary-button" aria-label="Disconnect Dropbox"
        disabled={disconnecting} onClick={disconnect}>
        Disconnect
      </button>}
    </div>
  </div>;
}
