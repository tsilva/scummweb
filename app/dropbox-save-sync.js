"use client";

import { useEffect, useRef, useState } from "react";
import { dropboxEnabled } from "./dropbox/bridge.mjs";
import { conflictReviewId, conflictVersion } from "./dropbox/conflict-review.mjs";

export default function DropboxSaveSync() {
  const [sync, setSync] = useState(null);
  const [state, setState] = useState(null);
  const [choices, setChoices] = useState({});
  const [submitting, setSubmitting] = useState(false);
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
  const conflicts = state?.conflicts ?? [];
  const reviewId = conflictReviewId(conflicts);
  const selected = (conflict) => choices[conflict.profile]?.version === conflictVersion(conflict) ? choices[conflict.profile].choice : "";
  useEffect(() => {
    setError("");
    const panel = dialog.current;
    if (reviewId && dismissed !== reviewId) panel?.showModal();
    else panel?.close();
    return () => panel?.close();
  }, [reviewId, dismissed]);
  async function resolve() {
    setSubmitting(true); setError("");
    try {
      // Wait only for durable local acceptance, never for a Dropbox request.
      await sync.queueDropboxConflictResolutions(conflicts.map((conflict) => ({ profile: conflict.profile,
        choice: selected(conflict), version: conflictVersion(conflict) })));
      setDismissed(reviewId);
      dialog.current?.close();
      setChoices({});
    } catch (failure) { setError(failure.message); }
    finally { setSubmitting(false); }
  }
  return <>
    {state && ["waiting", "reconnect"].includes(state.phase) && <aside className="dropbox-sync-warning" role="status">
      {state.phase === "reconnect" ? "Reconnect Dropbox in Settings to protect your latest saves." : "Latest saves are on this device, waiting to sync."}
    </aside>}
    <dialog ref={dialog} className="dropbox-conflict" aria-labelledby="dropbox-conflict-title"
      onCancel={(event) => { event.preventDefault(); if (!submitting) setDismissed(reviewId); }}>
      {conflicts.length > 0 && <>
        <h2 id="dropbox-conflict-title">Choose saved progress</h2>
        <p>Choose the progress to use for each game. Both copies stay saved.</p>
        <div className="dropbox-conflict-games">
          {conflicts.map((conflict) => <fieldset key={conflict.profile} disabled={submitting}>
            <legend>{conflict.title}</legend>
            <div className="dropbox-conflict-options">
              {[["local", conflict.localLabel || "This device", conflict.local], ["remote", conflict.remoteLabel || "Dropbox", conflict.remote]].map(([value, label, set]) =>
                <label key={value} className="settings-choice"><input type="radio" name={`dropbox-progress-${conflict.profile}`} value={value}
                  checked={selected(conflict) === value} onChange={() => setChoices((current) => ({ ...current,
                    [conflict.profile]: { choice: value, version: conflictVersion(conflict) } }))} />
                  <span><strong>{label}</strong><small>{set.files.length} save {set.files.length === 1 ? "file" : "files"}</small></span></label>)}
            </div>
          </fieldset>)}
        </div>
        <p className="dropbox-conflict-hint">Other copies remain available in Saved games.</p>
        {error && <p role="alert">{error}</p>}
        <div className="settings-review-actions">
          <button type="button" disabled={submitting} onClick={() => setDismissed(reviewId)}>Decide later</button>
          <button type="button" disabled={submitting || conflicts.some((conflict) => !selected(conflict))} onClick={resolve}>Apply choices</button>
        </div>
      </>}
    </dialog>
  </>;
}
