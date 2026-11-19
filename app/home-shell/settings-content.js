"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowDownUp, ArrowLeft, Check, ChevronDown, Download, Info, LoaderCircle, Save, Upload } from "lucide-react";
import { readGameSources } from "../game-sources.mjs";
import "../styles/settings-details.css";
import DropboxRow from "./dropbox-row";
import DropboxPreview from "./dropbox-preview";
import { openSaveStorage } from "../../web-shell/save-storage.mjs";
import { hasEmptyBaseballRecords } from "../save-backups/baseball-records.mjs";

const formatSaveCount = (count) => `${count} save ${count === 1 ? "file" : "files"}`;

export default function SettingsContent({ catalog, officialUrl, scummvmVersion, sourceInfoDate, working, busy, setBusy }) {
  const picker = useRef(null);
  const pendingImport = useRef(null);
  const [section, setSection] = useState("");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [data, setData] = useState({ sets: [], stored: [], unmatched: new Set(), matches: new Map(), destinations: [], revision: "" });
  const [review, setReview] = useState(null);
  const [exportState, setExportState] = useState("idle");
  const [recovering, setRecovering] = useState(false);
  const [importGame, setImportGame] = useState("");
  const [needsImportGame, setNeedsImportGame] = useState(false);

  useEffect(() => {
    if (exportState !== "downloaded") return;
    const timer = setTimeout(() => setExportState("idle"), 1800);
    return () => clearTimeout(timer);
  }, [exportState]);

  async function refresh(storage) {
    const [{ getActiveSaveSets, getSaveDestinations, matchDestination, readStoredSets }, sources] = await Promise.all([
      import("../save-backups/backups.mjs"), readGameSources(catalog, officialUrl),
    ]);
    const destinations = await getSaveDestinations(catalog, sources);
    const [active, stored] = await Promise.all([
      (storage ? Promise.resolve(storage) : openSaveStorage()).then(view => getActiveSaveSets(view, destinations)),
      readStoredSets(),
    ]);
    const matches = new Map([...active.sets, ...stored].map((set) => [set, matchDestination(set, destinations)]));
    const unmatched = new Set([...matches].filter(([, key]) => !key).map(([set]) => set));
    const result = { ...active, stored, unmatched, matches, destinations };
    setData(result);
    return result;
  }

  async function run(action) {
    if (working.current) return;
    working.current = true;
    setBusy(true);
    setError("");
    setNotice("");
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
    const { preferredSaveMerge } = await import("../dropbox/save-merge.mjs");
    const used = new Set();
    const rows = await Promise.all(sets.map(async (set) => {
      const sourceSet = set;
      const destinationKey = matchDestination(set, current.destinations);
      const choice = used.has(destinationKey) || set.recovery && !activating ? "stored" : "imported";
      used.add(destinationKey);
      const active = current.sets.find((item) => item.destination.key === destinationKey);
      if (!activating && choice === "imported" && active && active.hash !== set.hash) {
        set = (await preferredSaveMerge([set, active])).set;
      }
      return { set, sourceSet, destinationKey, choice };
    }));
    setReview({ rows, revision: current.revision, activating });
  }

  async function download() {
    if (working.current || exportState !== "idle") return;
    await run(async () => {
      setExportState("exporting");
      let downloaded = false;
      let href;
      try {
        const [{ withSaveLock }, { exportScummvmSaves }] = await Promise.all([
          import("../save-backups/backups.mjs"), import("../save-backups/scummvm-transfer.mjs"),
        ]);
        const blob = await withSaveLock(async () => {
          const current = await refresh();
          return exportScummvmSaves([...current.sets, ...current.stored]);
        });
        href = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = href;
        link.download = `scummweb-saves-${new Date().toISOString().slice(0, 10)}.zip`;
        setExportState("downloading");
        // Let the browser paint the handoff state before starting its download.
        await new Promise((resolve) => setTimeout(resolve, 400));
        document.body.appendChild(link);
        try { link.click(); }
        finally { link.remove(); }
        downloaded = true;
        setExportState("downloaded");
      } finally {
        // Give the browser time to resolve the download before releasing its URL.
        if (href) setTimeout(() => URL.revokeObjectURL(href), 1000);
        if (!downloaded) setExportState("idle");
      }
    });
  }

  async function reviewImport(files, game = importGame) {
    await run(async () => {
      const [{ readSaveImport }, { withSaveLock }] = await Promise.all([
        import("../save-backups/scummvm-transfer.mjs"), import("../save-backups/backups.mjs"),
      ]);
      const current = await withSaveLock(() => refresh());
      try {
        const sets = await readSaveImport(files, current.destinations, game);
        await prepareReview(sets, current);
        pendingImport.current = null;
        setNeedsImportGame(false);
        setImportGame("");
      } catch (error) {
        if (error.kind === "choose-game") {
          pendingImport.current = files;
          setNeedsImportGame(true);
        }
        throw error;
      }
    });
  }

  async function chooseBackup(event) {
    const files = Array.from(event.target.files || []);
    event.target.value = "";
    if (files.length) await reviewImport(files);
  }

  async function chooseImportGame(event) {
    const game = event.target.value;
    setImportGame(game);
    if (game && pendingImport.current) await reviewImport(pendingImport.current, game);
  }

  async function confirmImport() {
    await run(async () => {
      const [{ applyImport, matchDestination, withSaveLock }, { preferredSaveMerge }] = await Promise.all([
        import("../save-backups/backups.mjs"), import("../dropbox/save-merge.mjs"),
      ]);
      await withSaveLock(async (db) => {
        const storage = await openSaveStorage(db);
        const current = await refresh(storage);
        let initialConfig;
        if (!current.hasRoot) {
          const response = await fetch("/scummvm.ini");
          if (!response.ok) throw new Error("Could not initialize save storage. Try again when online.");
          initialConfig = await response.text();
        }
        // Sync and native metadata checks can change the tree while review is
        // open. Recompute from the original incoming files under the lock, so
        // newly saved compatible slots are retained and current progress is
        // preserved before an intentional incoming overwrite.
        const rows = await Promise.all(review.rows.map(async (row) => {
          let set = row.sourceSet || row.set;
          const destinationKey = matchDestination(set, current.destinations);
          const active = current.sets.find((item) => item.destination.key === destinationKey);
          if (!review.activating && row.choice === "imported" && active && active.hash !== set.hash) {
            set = (await preferredSaveMerge([set, active])).set;
          }
          return { ...row, set, destinationKey };
        }));
        await applyImport({ storage, ...review, rows, revision: current.revision,
          destinations: current.destinations, initialConfig });
        await refresh(storage);
      });
      window.dispatchEvent(new Event("scummweb:saves-changed"));
      setNotice(review.activating ? "Saved progress restored." : "Saves imported.");
      setReview(null);
      setRecovering(false);
    });
  }

  const savedCount = data.sets.reduce((total, set) => total + set.files.length, 0);
  const transferring = busy || exportState !== "idle";
  const exportLabel = { idle: "Export saves", exporting: "Exporting", downloading: "Downloading", downloaded: "Downloaded" }[exportState];
  const storedOnly = data.stored.filter((set) => !data.sets.some((active) => active.destination.key === set.destination.key && active.hash === set.hash));
  const matchedStored = storedOnly.filter((set) => !data.unmatched.has(set) && !(set.files.length === 1 && hasEmptyBaseballRecords(set)));
  const recovery = new Map();
  for (const set of matchedStored) {
    const key = data.matches.get(set) || set.destination.key;
    if (data.sets.some((current) => current.destination.key === key && current.hash === set.hash)) continue;
    if (!recovery.has(key)) {
      const destination = data.destinations.find((item) => item.key === key) || set.destination;
      recovery.set(key, { key, title: destination.family === "shared" ? "Older imported saves" : destination.title, copies: [] });
    }
    recovery.get(key).copies.push(set);
  }
  const recoveryGroups = [...recovery.values()].sort((a, b) => a.title.localeCompare(b.title));
  for (const group of recoveryGroups) group.copies.sort((a, b) => (b.preservedAt || 0) - (a.preservedAt || 0));
  const unmatchedFileCount = [...data.sets, ...storedOnly].reduce((total, set) =>
    total + (data.unmatched.has(set) ? set.files.length : 0), 0);
  const unmatchedCount = review?.rows.filter((row) => !row.destinationKey).length ?? 0;
  const replacingProgress = review?.rows.some((row) => row.choice === "imported" && data.sets.some((set) =>
    set.destination.key === row.destinationKey && set.hash !== row.set.hash));

  return <>
    {error && <p className="settings-error" role="alert">{error}</p>}
    <p className="settings-status" role="status">{notice}</p>
    <button type="button" className={`settings-section-heading ${section === "saves" ? "is-active" : ""}`}
      aria-expanded={section === "saves"} aria-controls="settings-saves" disabled={busy}
      onClick={() => setSection(section === "saves" ? "" : "saves")}>
      <Save size={24} /><span>Saved games</span><ChevronDown size={20} />
    </button>
    <section id="settings-saves" hidden={section !== "saves"} aria-busy={busy}>
      {!review && !recovering && <>
        <DropboxPreview><DropboxRow /></DropboxPreview>
        <div className="settings-action-block"><ArrowDownUp size={25} aria-hidden="true" />
          <div><h3>Transfer saves</h3><p>Transfer saves to or from desktop ScummVM. Exported ZIPs keep the original save filenames.</p></div>
          <div className="settings-transfer-actions">
            <button type="button" className="secondary-button settings-wide" disabled={transferring || (!savedCount && !data.stored.length)} onClick={download}>
              {exportState === "idle" ? <Download size={20} aria-hidden="true" />
                : exportState === "downloaded" ? <Check size={20} aria-hidden="true" />
                  : <LoaderCircle size={20} className="settings-export-spinner" aria-hidden="true" />}
              <span aria-live="polite" aria-atomic="true">{exportLabel}</span>
            </button>
            <button type="button" className="launch-button settings-wide" disabled={transferring} onClick={() => picker.current.click()}><Upload size={20} aria-hidden="true" />Import saves</button>
          </div>
          {needsImportGame && <label className="settings-import-game">Game for imported saves
            <select value={importGame} disabled={busy} onChange={chooseImportGame}>
              <option value="">Detect automatically</option>
              {data.destinations.filter(({ key }) => key !== "shared").map(({ key, title }) => <option key={key} value={key}>{title}</option>)}
            </select>
          </label>}
        </div>
        {(recoveryGroups.length > 0 || unmatchedFileCount > 0) && <button type="button" className="settings-recovery-link" disabled={busy}
          onClick={() => setRecovering(true)}>Recover saved progress</button>}
      </>}
      {!review && recovering && <div className="settings-recovery">
        <button type="button" className="settings-back" disabled={busy} onClick={() => setRecovering(false)}><ArrowLeft size={17} aria-hidden="true" />Back to saved games</button>
        <h3>Recover saved progress</h3>
        <p>Choose a game to see its backups. Restoring a copy keeps your current progress as a backup.</p>
        {!recoveryGroups.length && !unmatchedFileCount && <p>No earlier copies are available on this browser.</p>}
        {recoveryGroups.map((group) => <details className="settings-recovery-game" key={group.key}>
          <summary><strong>{group.title}</strong><span>{group.copies.length} {group.copies.length === 1 ? "backup" : "backups"}</span><ChevronDown size={17} aria-hidden="true" /></summary>
          {group.copies.map((set) => <div className="settings-set" key={set.id}>
            <span>{Number.isFinite(set.preservedAt) ? `Copy kept ${new Date(set.preservedAt).toLocaleDateString()}` : "Saved copy"}</span>
            <button type="button" className="secondary-button" disabled={busy} onClick={() => run(async () => {
              const { withSaveLock } = await import("../save-backups/backups.mjs");
              await prepareReview([set], await withSaveLock(() => refresh()), true);
            })}>Restore this copy…</button>
          </div>)}
        </details>)}
        {unmatchedFileCount > 0 && <div className="settings-unmatched"><h4>Saves for games not in your library</h4>
          <p>Add the matching game to restore these copies. They are also included when you export your saves.</p></div>}
      </div>}
      {review && <div className="settings-review"><h3>{review.activating ? "Restore saved progress" : "Review import"}</h3>
        <p>Saves are matched to their games automatically. Games missing from this backup stay unchanged.</p>
        {review.rows.map((row, index) => {
          if (!row.destinationKey) return null;
          const active = data.sets.find((set) => set.destination.key === row.destinationKey);
          const identical = active?.hash === row.set.hash;
          return <fieldset key={index} className="settings-review-game" disabled={busy}><legend>{row.set.destination.title}</legend>
            {identical ? <p className="settings-active"><Check size={17} />Identical saves — nothing to change.</p> : <>
              <p>{formatSaveCount(row.set.files.length)} · {row.choice === "stored" ? "Keep as a recovery copy" : "Ready to import"}</p>
              {active && <p>Your current progress will be kept in Recover saved progress.</p>}
            </>}
          </fieldset>;
        })}
        {unmatchedCount > 0 && <fieldset className="settings-review-game">
          <legend>{unmatchedCount} unmatched save {unmatchedCount === 1 ? "set" : "sets"}</legend>
          <p>These saves will be kept as backups. Add the matching game, then open Recover saved progress to restore them.</p>
        </fieldset>}
        {replacingProgress && <p className="settings-reassurance">Your current progress will be kept as a backup in Recover saved progress.</p>}
        <div className="settings-review-actions"><button type="button" className="secondary-button" disabled={busy} onClick={() => setReview(null)}>Cancel</button>
          <button type="button" className="launch-button" disabled={busy} onClick={confirmImport}>{review.activating ? "Restore this copy" : "Import saves"}</button></div>
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
    <input ref={picker} type="file" multiple aria-label="Choose ScummVM save files or a ZIP" hidden onChange={chooseBackup} />
  </>;
}
