"use client";

import { useEffect, useRef, useState } from "react";
import { dropboxEnabled } from "./dropbox/bridge.mjs";

export default function DropboxSaveSync() {
  const [sync, setSync] = useState(null);
  const [state, setState] = useState(null);
  const [choice, setChoice] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [dismissed, setDismissed] = useState("");
  const dialog = useRef(null);
  useEffect(() => {
    const review = () => setDismissed("");
    window.addEventListener("scummweb:dropbox-review", review);
    return () => window.removeEventListener("scummweb:dropbox-review", review);
  }, []);
  useEffect(() => {
    let stopped = false, cleanup, unsubscribe;
    async function start() {
      if (!dropboxEnabled() || cleanup) return;
      const runtime = await import("./dropbox/runtime.mjs");
      if (stopped || cleanup) return;
      setSync(runtime);
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
  const conflict = state?.conflicts.find(({ canResolve }) => canResolve);
  const conflictId = conflict ? `${conflict.profile}:${conflict.local.hash}:${conflict.remoteHash}` : "";
  useEffect(() => {
    setChoice(""); setError("");
    const panel = dialog.current;
    if (conflictId && dismissed !== conflictId) panel?.showModal();
    else panel?.close();
    return () => panel?.close();
  }, [conflictId, dismissed]);
  async function resolve() {
    setBusy(true); setError("");
    try { await sync.resolveDropboxConflict(conflict.profile, choice); }
    catch (failure) { setError(failure.message); }
    finally { setBusy(false); }
  }
  return <>
    {state && ["waiting", "reconnect"].includes(state.phase) && <aside className="dropbox-sync-warning" role="status">
      {state.phase === "reconnect" ? "Reconnect Dropbox in Settings to protect your latest saves." : "Latest saves are on this device, waiting to sync."}
    </aside>}
    <dialog ref={dialog} className="dropbox-conflict" aria-labelledby="dropbox-conflict-title"
      onCancel={(event) => { event.preventDefault(); if (!busy) setDismissed(conflictId); }}>
      {conflict && <>
        <h2 id="dropbox-conflict-title">Choose progress to continue</h2>
        <p>{conflict.title} has different saved progress. Both copies are saved in Dropbox.</p>
        <fieldset disabled={busy}>
          {[ ["local", conflict.localLabel || "This device", conflict.local], ["remote", conflict.remoteLabel || "Dropbox", conflict.remote] ].map(([value, label, set]) =>
            <label key={value} className="settings-choice"><input type="radio" name="dropbox-progress" value={value}
              checked={choice === value} onChange={() => setChoice(value)} />
              <span><strong>{label}</strong><small>{set.files.length} save files</small></span></label>)}
        </fieldset>
        <p>The other copy stays available in Saved games.</p>
        {error && <p role="alert">{error}</p>}
        <div className="settings-review-actions">
          <button type="button" disabled={busy} onClick={() => setDismissed(conflictId)}>Decide later</button>
          <button type="button" disabled={busy || !choice} onClick={resolve}>{busy ? "Saving…" : "Use selected progress"}</button>
        </div>
      </>}
    </dialog>
  </>;
}
