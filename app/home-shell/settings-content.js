"use client";

import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown, Download, Info, Save, Upload } from "lucide-react";
import { readGameSources } from "../game-sources.mjs";

const formatSaveCount = (count) => `${count} save ${count === 1 ? "file" : "files"}`;

export default function SettingsContent({ catalog, officialUrl, scummvmVersion, sourceInfoDate, working, busy, setBusy }) {
  const picker = useRef(null);
  const [section, setSection] = useState("saves");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [data, setData] = useState({ sets: [], stored: [], unmatched: new Set(), destinations: [], revision: "" });
  const [review, setReview] = useState(null);
  const [downloadReady, setDownloadReady] = useState(null);

  useEffect(() => () => { if (downloadReady) URL.revokeObjectURL(downloadReady.href); }, [downloadReady]);

  async function refresh() {
    const [{ getActiveSaveSets, getSaveDestinations, matchDestination, readStoredSets }, sources] = await Promise.all([
      import("../save-backups/backups.mjs"), readGameSources(catalog, officialUrl),
    ]);
    const destinations = await getSaveDestinations(catalog, sources);
    const [active, stored] = await Promise.all([getActiveSaveSets(window.localStorage, destinations), readStoredSets()]);
    const unmatched = new Set([...active.sets, ...stored].filter((set) => !matchDestination(set, destinations)));
    const result = { ...active, stored, unmatched, destinations };
    setData(result);
    return result;
  }

  async function run(action) {
    if (working.current) return;
    working.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    setDownloadReady(null);
    try { await action(); }
    catch (failure) { setError(failure?.message || "Could not update saved games. Your current progress is still available."); }
    finally { working.current = false; setBusy(false); }
  }

  useEffect(() => {
    void run(refresh);
    // Load only when Settings opens, not while the library boots.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function prepareReview(sets, current, activating = false) {
    const { matchDestination } = await import("../save-backups/backups.mjs");
    const used = new Set();
    const rows = sets.map((set) => {
      const destinationKey = matchDestination(set, current.destinations);
      const active = current.sets.find((item) => item.destination.key === destinationKey);
      const choice = used.has(destinationKey) ? "stored" : activating || !active ? "imported" : "current";
      used.add(destinationKey);
      return { set, destinationKey, choice };
    });
    setReview({ rows, revision: current.revision, activating });
  }

  function updateChoice(index, choice) {
    setReview((current) => ({ ...current, rows: current.rows.map((row, i) => i === index
      ? { ...row, choice } : row) }));
  }

  async function download() {
    await run(async () => {
      const { exportBackup, withSaveLock } = await import("../save-backups/backups.mjs");
      const blob = await withSaveLock(async () => {
        const current = await refresh();
        const unique = new Map([...current.sets, ...current.stored].map((set) => [`${set.destination.key}:${set.hash}`, set]));
        return exportBackup([...unique.values()]);
      });
      const href = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = href;
      link.download = `scummweb-saves-${new Date().toISOString().slice(0, 10)}.zip`;
      setDownloadReady({ href, name: link.download });
      document.body.appendChild(link);
      link.click();
      link.remove();
    });
  }

  async function chooseBackup(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    await run(async () => {
      const { readBackup, withSaveLock } = await import("../save-backups/backups.mjs");
      const sets = await readBackup(file);
      await prepareReview(sets, await withSaveLock(refresh));
    });
  }

  async function confirmImport() {
    await run(async () => {
      const [{ applyImport, withSaveLock }, { captureFilesystem }] = await Promise.all([
        import("../save-backups/backups.mjs"), import("../save-backups/filesystem.mjs"),
      ]);
      await withSaveLock(async () => {
        let initialConfig;
        if (!captureFilesystem(localStorage).root.key) {
          const response = await fetch("/scummvm.ini");
          if (!response.ok) throw new Error("Could not initialize save storage. Try again when online.");
          initialConfig = await response.text();
        }
        await applyImport({ storage: localStorage, ...review, destinations: data.destinations, initialConfig });
        await refresh();
      });
      window.dispatchEvent(new Event("scummweb:saves-changed"));
      setNotice(review.activating ? "Saves activated. Your previous progress is still available here." : "Backup imported. Any conflicting saves are also available here.");
      setReview(null);
    });
  }

  const savedCount = data.sets.reduce((total, set) => total + set.files.length, 0);
  const storedOnly = data.stored.filter((set) => !data.sets.some((active) => active.destination.key === set.destination.key && active.hash === set.hash));
  const matchedActive = data.sets.filter((set) => !data.unmatched.has(set));
  const matchedStored = storedOnly.filter((set) => !data.unmatched.has(set));
  const unmatchedFileCount = [...data.sets, ...storedOnly].reduce((total, set) =>
    total + (data.unmatched.has(set) ? set.files.length : 0), 0);
  const unmatchedCount = review?.rows.filter((row) => !row.destinationKey).length ?? 0;

  return <>
    {error && <p className="settings-error" role="alert">{error}</p>}
    <p className="settings-status" role="status">{notice}</p>
    <button type="button" className={`settings-section-heading ${section === "saves" ? "is-active" : ""}`}
      aria-expanded={section === "saves"} aria-controls="settings-saves" disabled={busy}
      onClick={() => setSection(section === "saves" ? "" : "saves")}>
      <Save size={24} /><span>Saved games</span><ChevronDown size={20} />
    </button>
    <section id="settings-saves" hidden={section !== "saves"} aria-busy={busy}>
      {!review && <>
        <div className="settings-action-block"><Download size={25} aria-hidden="true" />
          <div><h3>Export saves</h3><p>Download all saved progress as a ZIP.</p></div>
          <button type="button" className="secondary-button settings-wide" disabled={busy || (!savedCount && !data.stored.length)} onClick={download}>
            <Download size={20} />Export all saves
          </button>
          <p className="settings-status" role="status">{downloadReady && <>
            Backup ready. <a className="settings-download" href={downloadReady.href} download={downloadReady.name}>Download ZIP</a>
          </>}</p>
        </div>
        <div className="settings-action-block"><Upload size={25} aria-hidden="true" />
          <div><h3>Import saves</h3><p>Review a backup before restoring it.</p></div>
          <button type="button" className="launch-button settings-wide" disabled={busy} onClick={() => picker.current.click()}><Upload size={20} />Import backup</button>
        </div>
        <p className="settings-footnote">Game files are not included in backups.</p>
        <div className="settings-save-list">
          {matchedStored.length > 0 && <p>Only active saves are used when you play. Switching keeps your previous saves.</p>}
          {!busy && !savedCount && !storedOnly.length && <p>No saved progress on this browser yet.</p>}
          {matchedActive.map((set) => <div className="settings-set" key={set.destination.key}><strong>{set.destination.title}</strong><small>{formatSaveCount(set.files.length)}{matchedStored.length > 0 && " · Active"}</small></div>)}
          {matchedStored.map((set) => <div className="settings-set" key={set.id}><strong>{set.destination.title}</strong><small>{formatSaveCount(set.files.length)} · Preserved {new Date(set.preservedAt).toLocaleDateString()}</small>
            <button type="button" className="secondary-button" disabled={busy} onClick={() => run(async () => {
              const { withSaveLock } = await import("../save-backups/backups.mjs");
              await prepareReview([set], await withSaveLock(refresh), true);
            })}>Review and activate</button></div>)}
          {unmatchedFileCount > 0 && <div className="settings-set"><strong>Unmatched imported games</strong><small>{formatSaveCount(unmatchedFileCount)}</small></div>}
        </div>
      </>}
      {review && <div className="settings-review"><h3>{review.activating ? "Activate saves" : "Review import"}</h3>
        <p>Saves are matched to their games automatically. Games missing from this backup stay unchanged.</p>
        {review.rows.map((row, index) => {
          if (!row.destinationKey) return null;
          const active = data.sets.find((set) => set.destination.key === row.destinationKey);
          const identical = active?.hash === row.set.hash;
          return <fieldset key={index} className="settings-review-game" disabled={busy}><legend>{row.set.destination.title}</legend>
            {identical ? <p className="settings-active"><Check size={17} />Identical saves — nothing to change.</p> : <>
              {active && <p>Different saves exist on this device.</p>}
              <label className="settings-choice"><input type="radio" name={`save-choice-${index}`} checked={row.choice !== "imported"}
                onChange={() => updateChoice(index, active ? "current" : "stored")} />
                <span><strong>{active ? "Keep current saves active" : "Preserve without activating"}</strong><small>{active ? `This device · ${formatSaveCount(active.files.length)}` : "Activate later from Saved games"}</small></span></label>
              <label className="settings-choice"><input type="radio" name={`save-choice-${index}`} checked={row.choice === "imported"}
                onChange={() => updateChoice(index, "imported")} /><span><strong>Use imported saves</strong><small>Backup · {formatSaveCount(row.set.files.length)}</small></span></label>
            </>}
          </fieldset>;
        })}
        {unmatchedCount > 0 && <fieldset className="settings-review-game">
          <legend>{unmatchedCount} unmatched save {unmatchedCount === 1 ? "set" : "sets"}</legend>
          <p>These saves will be preserved. To activate them, add the matching game, then open Saved games.</p>
        </fieldset>}
        {unmatchedCount < review.rows.length && <p className="settings-reassurance">If you switch to imported saves, your current saves stay available in Saved games.</p>}
        <div className="settings-review-actions"><button type="button" className="secondary-button" disabled={busy} onClick={() => setReview(null)}>Cancel</button>
          <button type="button" className="launch-button" disabled={busy} onClick={confirmImport}>{review.activating ? "Activate saves" : "Import backup"}</button></div>
      </div>}
    </section>
    <button type="button" className={`settings-section-heading ${section === "about" ? "is-active" : ""}`}
      aria-expanded={section === "about"} aria-controls="settings-about" disabled={busy} onClick={() => setSection(section === "about" ? "" : "about")}>
      <Info size={24} /><span>About</span><ChevronDown size={20} />
    </button>
    <section id="settings-about" hidden={section !== "about"}>
      <h3>ScummWEB</h3>
      <p>Classic adventures in your browser.</p>
      <p>ScummWEB is an independent browser frontend for ScummVM. It is not affiliated with, endorsed by, or sponsored by the ScummVM project.</p>
      <p>ScummVM {scummvmVersion}<br />Bundle built {sourceInfoDate}.</p>
      <a href="https://www.scummvm.org/" target="_blank" rel="noreferrer">Visit ScummVM</a>
    </section>
    <input ref={picker} type="file" accept=".zip,application/zip" aria-label="Choose save backup ZIP" hidden onChange={chooseBackup} />
  </>;
}
