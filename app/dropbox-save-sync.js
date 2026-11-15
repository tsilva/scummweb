"use client";

import { useEffect, useRef, useState } from "react";
import { dropboxEnabled } from "./dropbox/bridge.mjs";
import { conflictOptions, conflictReviewId, conflictVersion } from "./dropbox/conflict-review.mjs";

function FileCopy({ file }) {
  if (!file) return <span>Absent</span>;
  const date = new Date(file.modifiedAt);
  return <span className="dropbox-file-copy">
    <span>{file.size.toLocaleString()} bytes</span>
    {Number.isFinite(date.getTime()) && file.modifiedAt > 0 && <time title="File modification time" dateTime={date.toISOString()}>{date.toLocaleString()}</time>}
  </span>;
}

function FileDifferences({ conflict, rows }) {
  return <div className="dropbox-file-differences"><table>
    <thead><tr><th scope="col">File</th>{conflictOptions(conflict).map(({ value, label }) => <th key={value} scope="col">{label}</th>)}</tr></thead>
    <tbody>{rows.map((row) => <tr key={row.path}>
      <th scope="row"><code>{row.path}</code><small>{row.reason}</small></th>
      {row.versions.map((file, index) => <td key={index}><FileCopy file={file} /></td>)}
    </tr>)}</tbody>
  </table></div>;
}

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
        <p>Separate saves are combined automatically. Choose which copy to use for files with conflicting changes.</p>
        <div className="dropbox-conflict-games">
          {conflicts.map((conflict) => <fieldset key={conflict.profile} disabled={submitting}>
            <legend>{conflict.title}</legend>
            <div className="dropbox-conflict-options">
              {conflictOptions(conflict).map(({ value, label, set }) =>
                <label key={value} className="settings-choice"><input type="radio" name={`dropbox-progress-${conflict.profile}`} value={value}
                  checked={selected(conflict) === value} onChange={() => setChoices((current) => ({ ...current,
                    [conflict.profile]: { choice: value, version: conflictVersion(conflict) } }))} />
                  <span><strong>{label}</strong><small>{set.files.length} save {set.files.length === 1 ? "file" : "files"}</small></span></label>)}
            </div>
            {conflict.differences?.length > 0 && <>
              <FileDifferences conflict={conflict} rows={conflict.differences.filter(({ conflict }) => conflict)} />
              {conflict.differences.some(({ conflict }) => !conflict) && <details className="dropbox-combined-files">
                <summary>Other changes kept with either choice ({conflict.differences.filter(({ conflict }) => !conflict).length})</summary>
                <FileDifferences conflict={conflict} rows={conflict.differences.filter(({ conflict }) => !conflict)} />
              </details>}
              {conflict.identical > 0 && <p className="dropbox-identical-files">{conflict.identical} identical {conflict.identical === 1 ? "file" : "files"} kept.</p>}
            </>}
          </fieldset>)}
        </div>
        <p className="dropbox-conflict-hint">Compatible saves are kept with either choice. Original copies remain available in Saved games.</p>
        {error && <p role="alert">{error}</p>}
        <div className="settings-review-actions">
          <button type="button" disabled={submitting} onClick={() => setDismissed(reviewId)}>Decide later</button>
          <button type="button" disabled={submitting || conflicts.some((conflict) => !selected(conflict))} onClick={resolve}>Apply choices</button>
        </div>
      </>}
    </dialog>
  </>;
}
