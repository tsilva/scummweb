"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowLeft, Check, ChevronDown, ChevronRight, Download, Info, Layers, Save, Settings, Upload, X } from "lucide-react";
import { readGameSources } from "../game-sources.mjs";
import { applyImport, exportBackup, getActiveSaveSets, getSaveDestinations, matchDestination, readBackup, readStoredSets, withSaveLock } from "../save-backups/backups.mjs";
import { captureFilesystem } from "../save-backups/filesystem.mjs";

const countFiles = (set) => `${set.files.length} save ${set.files.length === 1 ? "file" : "files"}`;

export default function SettingsPanel({ catalog, officialUrl, scummvmVersion, sourceInfoDate }) {
  const dialog = useRef(null);
  const trigger = useRef(null);
  const picker = useRef(null);
  const working = useRef(false);
  const [open, setOpen] = useState(false);
  const [section, setSection] = useState("saves");
  const [view, setView] = useState("home");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [data, setData] = useState({ sets: [], stored: [], destinations: [], revision: "" });
  const [review, setReview] = useState(null);
  const [downloadReady, setDownloadReady] = useState(null);

  useEffect(() => () => { if (downloadReady) URL.revokeObjectURL(downloadReady.href); }, [downloadReady]);

  async function refresh() {
    const sources = await readGameSources(catalog, officialUrl);
    const destinations = await getSaveDestinations(catalog, sources);
    const [active, stored] = await Promise.all([getActiveSaveSets(window.localStorage, destinations), readStoredSets()]);
    const result = { ...active, stored, destinations };
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
    if (!open) return;
    const panel = dialog.current;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    panel.showModal();
    panel.querySelector(".settings-close")?.focus();
    void run(refresh);
    return () => {
      panel.close();
      document.body.style.overflow = overflow;
      trigger.current?.focus({ preventScroll: true });
    };
    // Load only when Settings opens, not while the library boots.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  function close() {
    if (working.current) return;
    setOpen(false);
    setView("home");
    setReview(null);
  }

  function prepareReview(sets, current, activating = false) {
    const used = new Set();
    const rows = sets.map((set) => {
      const destinationKey = matchDestination(set, current.destinations);
      const active = current.sets.find((item) => item.destination.key === destinationKey);
      const choice = used.has(destinationKey) ? "stored" : activating || !active ? "imported" : "current";
      used.add(destinationKey);
      return { set, destinationKey, choice };
    });
    setReview({ rows, revision: current.revision, activating });
    setView("review");
  }

  function updateRow(index, field, value) {
    const choice = field === "destinationKey"
      ? (data.sets.some((set) => set.destination.key === value) ? "current" : "stored") : value;
    setReview((current) => ({ ...current, rows: current.rows.map((row, i) => i === index
      ? { ...row, [field]: value, ...(field === "destinationKey" ? { choice } : {}) } : row) }));
  }

  async function download() {
    await run(async () => {
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
      setNotice("Backup ready. Keep the ZIP somewhere safe.");
    });
  }

  async function chooseBackup(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    await run(async () => {
      const sets = await readBackup(file);
      prepareReview(sets, await withSaveLock(refresh));
    });
  }

  async function confirmImport() {
    await run(async () => {
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
      setNotice(review.activating ? "Save set activated. Your other progress is still available in Save sets." : "Backup imported. Both sides of any conflict are available in Save sets.");
      setReview(null);
      setView("home");
    });
  }

  const savedCount = data.sets.reduce((total, set) => total + set.files.length, 0);
  const storedOnly = data.stored.filter((set) => !data.sets.some((active) => active.destination.key === set.destination.key && active.hash === set.hash));

  return <>
    <button ref={trigger} type="button" className="nav-icon-link settings-trigger" aria-label="Settings" title="Settings" aria-haspopup="dialog" aria-expanded={open}
      aria-controls="site-settings" onClick={() => { setSection("saves"); setOpen(true); }}>
      <Settings className="icon" aria-hidden="true" />
    </button>
    <dialog ref={dialog} id="site-settings" className="settings-drawer" aria-labelledby="settings-title"
      onCancel={(event) => { event.preventDefault(); close(); }} onClick={(event) => { if (event.target === dialog.current) close(); }}>
      <div className="settings-content" aria-busy={busy}>
        <header className="settings-heading"><h2 id="settings-title">Settings</h2>
          <button type="button" className="settings-close" aria-label="Close settings" disabled={busy} onClick={close}><X size={24} /></button>
        </header>
        {error && <p className="settings-error" role="alert">{error}</p>}
        <p className="settings-status" role="status">{busy ? "Working with saved games…" : notice}
          {downloadReady && <a className="settings-download" href={downloadReady.href} download={downloadReady.name}>Download ZIP</a>}
        </p>
        <button type="button" className={`settings-section-heading ${section === "saves" ? "is-active" : ""}`}
          aria-expanded={section === "saves"} aria-controls="settings-saves" disabled={busy}
          onClick={() => setSection(section === "saves" ? "" : "saves")}>
          <Save size={24} /><span>Saved games</span><ChevronDown size={20} />
        </button>
        <section id="settings-saves" hidden={section !== "saves"}>
          {view === "home" && <>
            <h3 className="settings-intro-title">Your progress, wherever you play.</h3>
            <p>Export a backup here, then import it on another device.</p>
            <div className="settings-action-block"><Download size={25} aria-hidden="true" />
              <div><h4>Export saves</h4><p>Download all saved progress as a ZIP.</p></div>
              <button type="button" className="secondary-button settings-wide" disabled={busy || (!savedCount && !data.stored.length)} onClick={download}>
                <Download size={20} />Export all saves
              </button>
              {!busy && !savedCount && !data.stored.length && <p className="settings-empty">No saved progress on this browser yet.</p>}
            </div>
            <div className="settings-action-block"><Upload size={25} aria-hidden="true" />
              <div><h4>Import saves</h4><p>Review a backup before restoring it.</p></div>
              <button type="button" className="launch-button settings-wide" disabled={busy} onClick={() => picker.current.click()}><Upload size={20} />Import backup</button>
            </div>
            <button type="button" className="settings-manage" disabled={busy} onClick={() => { setNotice(""); setView("sets"); }}>
              <Layers size={25} /><span><strong>Save sets</strong><small>Keep separate playthroughs and choose which one is active.</small></span><ChevronRight size={20} />
            </button>
          </>}
          {view !== "home" && <button type="button" className="settings-back" disabled={busy} onClick={() => { setView("home"); setReview(null); setError(""); }}><ArrowLeft size={17} />Back to saved games</button>}
          {view === "sets" && <div className="settings-sets"><h3>Save sets</h3><p>Only the active set is used when you play. Switching preserves both sets.</p>
            {data.sets.length === 0 && storedOnly.length === 0 && <p>No saved progress on this browser yet.</p>}
            {data.sets.map((set) => <div className="settings-set" key={set.destination.key}><strong>{set.destination.title}</strong><small>{countFiles(set)}</small><span className="settings-active"><Check size={16} />Active</span></div>)}
            {storedOnly.map((set) => <div className="settings-set" key={set.id}><strong>{set.destination.title}</strong><small>{countFiles(set)} · Preserved {new Date(set.preservedAt).toLocaleDateString()}</small>
              <button type="button" className="secondary-button" disabled={busy} onClick={() => run(async () => prepareReview([set], await withSaveLock(refresh), true))}>Review and activate</button></div>)}
          </div>}
          {view === "review" && review && <div className="settings-review"><h3>{review.activating ? "Activate save set" : "Review import"}</h3>
            <p>Choose the matching game edition. Games missing from this backup stay unchanged.</p>
            {review.rows.map((row, index) => {
              const active = data.sets.find((set) => set.destination.key === row.destinationKey);
              const identical = active?.hash === row.set.hash;
              return <fieldset key={index} className="settings-review-game" disabled={busy}><legend>{row.set.destination.title}</legend>
                <label className="settings-destination">Restore to
                  <select value={row.destinationKey} onChange={(event) => updateRow(index, "destinationKey", event.target.value)}>
                    <option value="">Keep unassigned until the game is added</option>
                    {data.destinations.map((item) => <option key={item.key} value={item.key}>{item.title}{item.namespace ? " · Imported version" : " · Included / shared"}</option>)}
                  </select>
                </label>
                {identical ? <p className="settings-active"><Check size={17} />Identical saves — nothing to change.</p> : !row.destinationKey ? <p>This set will be preserved. Add the game, then activate it from Save sets.</p> : <>
                  {active && <p>Different saves exist on this device.</p>}
                  <label className="settings-choice"><input type="radio" name={`save-choice-${index}`} checked={row.choice !== "imported"}
                    onChange={() => updateRow(index, "choice", active ? "current" : "stored")} />
                    <span><strong>{active ? "Keep current saves active" : "Preserve without activating"}</strong><small>{active ? `This device · ${countFiles(active)}` : "Activate later from Save sets"}</small></span></label>
                  <label className="settings-choice"><input type="radio" name={`save-choice-${index}`} checked={row.choice === "imported"}
                    onChange={() => updateRow(index, "choice", "imported")} /><span><strong>Use imported saves</strong><small>Backup · {countFiles(row.set)}</small></span></label>
                </>}
              </fieldset>;
            })}
            <p className="settings-reassurance">Both save sets will be kept. You can switch later.</p>
            <div className="settings-review-actions"><button type="button" className="secondary-button" disabled={busy} onClick={() => { setReview(null); setView("home"); }}>Cancel</button>
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
        <p className="settings-footnote">Game files are not included in backups.</p>
        <input ref={picker} type="file" accept=".zip,application/zip" aria-label="Choose save backup ZIP" hidden onChange={chooseBackup} />
      </div>
    </dialog>
  </>;
}
