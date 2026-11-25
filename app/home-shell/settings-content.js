"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowDownUp, Check, ChevronDown, Download, Info, Save, Shield, Upload } from "lucide-react";
import { PrivacySettingsSwitches } from "../../lib/privacy-consent/controls";
import { readGameSources } from "../game-sources.mjs";
import "../styles/settings-details.css";
import DropboxRow from "./dropbox-row";
import { openSaveStorage } from "../../web-shell/save-storage.mjs";

const formatSaveCount = (count) => `${count} save ${count === 1 ? "file" : "files"}`;

export default function SettingsContent({ catalog, officialUrl, scummvmVersion, sourceInfoDate, working, busy, setBusy }) {
  const picker = useRef(null);
  const pendingImport = useRef(null);
  const reviewHeading = useRef(null);
  const initialReadStarted = useRef(false);
  const [section, setSection] = useState("");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [data, setData] = useState(null);
  const [review, setReview] = useState(null);
  const [exported, setExported] = useState(false);
  const [importGame, setImportGame] = useState("");
  const [needsImportGame, setNeedsImportGame] = useState(false);

  useEffect(() => {
    if (!exported) return;
    const timer = setTimeout(() => setExported(false), 1800);
    return () => clearTimeout(timer);
  }, [exported]);

  useEffect(() => {
    if (review) reviewHeading.current?.focus();
  }, [review]);

  async function refresh(storage) {
    const [{ getActiveSaveSets, getSaveDestinations, readStoredSets }, sources] = await Promise.all([
      import("../save-backups/backups.mjs"), readGameSources(catalog, officialUrl),
    ]);
    const destinations = await getSaveDestinations(catalog, sources);
    const [active, stored] = await Promise.all([
      (storage ? Promise.resolve(storage) : openSaveStorage()).then(view => getActiveSaveSets(view, destinations)),
      readStoredSets(),
    ]);
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
    try { await action(); }
    catch (failure) { setError(failure?.message || "Could not update saved games. Your current progress is still available."); }
    finally { working.current = false; setBusy(false); }
  }

  useEffect(() => {
    if (initialReadStarted.current) return;
    initialReadStarted.current = true;
    void refresh().catch((failure) => {
      setError(failure?.message || "Could not load saved games.");
      setData({ sets: [], stored: [], destinations: [], revision: "" });
    });
    // Load once per Settings opening, including when effects replay in development.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function prepareReview(sets, current) {
    const { matchDestination } = await import("../save-backups/backups.mjs");
    const { preferredSaveMerge } = await import("../dropbox/save-merge.mjs");
    const used = new Set();
    const rows = await Promise.all(sets.map(async (set) => {
      const sourceSet = set;
      const destinationKey = matchDestination(set, current.destinations);
      const choice = used.has(destinationKey) || set.recovery ? "stored" : "imported";
      used.add(destinationKey);
      const active = current.sets.find((item) => item.destination.key === destinationKey);
      if (choice === "imported" && active && active.hash !== set.hash) {
        set = (await preferredSaveMerge([set, active])).set;
      }
      return { set, sourceSet, destinationKey, choice };
    }));
    setReview({ rows });
  }

  async function download() {
    if (exported) return;
    await run(async () => {
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
        document.body.appendChild(link);
        try { link.click(); }
        finally { link.remove(); }
        setExported(true);
      } finally {
        // Give the browser time to resolve the download before releasing its URL.
        if (href) setTimeout(() => URL.revokeObjectURL(href), 1000);
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
          if (row.choice === "imported" && active && active.hash !== set.hash) {
            set = (await preferredSaveMerge([set, active])).set;
          }
          return { ...row, set, destinationKey };
        }));
        await applyImport({ storage, rows, revision: current.revision,
          destinations: current.destinations, initialConfig });
        await refresh(storage);
      });
      window.dispatchEvent(new Event("scummweb:saves-changed"));
      setNotice("Saves imported.");
      setReview(null);
    });
  }

  const loadingSaves = !data;
  const transferDisabled = busy || loadingSaves;
  const hasSaves = data?.sets.some(({ files }) => files.length > 0) || Boolean(data?.stored.length);
  const unmatchedCount = review?.rows.filter((row) => !row.destinationKey).length ?? 0;
  const replacingProgress = review?.rows.some((row) => row.choice === "imported" && data.sets.some((set) =>
    set.destination.key === row.destinationKey && set.hash !== row.set.hash));

  return <>
    {error && <p className="settings-error" role="alert">{error}</p>}
    <p className="settings-status" role="status">{notice}</p>
    <button type="button" className={`settings-section-heading ${section === "saves" ? "is-active" : ""}`}
      aria-expanded={section === "saves"} aria-controls="settings-saves"
      onClick={() => setSection(section === "saves" ? "" : "saves")}>
      <Save size={24} /><span>Saved games</span><ChevronDown size={20} />
    </button>
    <section id="settings-saves" hidden={section !== "saves"} aria-busy={busy}>
      {!review && <>
        <DropboxRow />
        <div className="settings-action-block"><ArrowDownUp size={25} aria-hidden="true" />
          <div><h3>Transfer saves</h3><p>Transfer saves to or from your ScummVM apps.</p></div>
          <div className="settings-transfer-actions" aria-busy={loadingSaves}>
            <button type="button" className="secondary-button settings-wide" disabled={transferDisabled || exported || !hasSaves} onClick={download}>
              {exported ? <Check size={20} aria-hidden="true" /> : <Download size={20} aria-hidden="true" />}
              <span aria-live="polite" aria-atomic="true">{exported ? "Downloaded" : "Export saves"}</span>
            </button>
            <button type="button" className="launch-button settings-wide" disabled={transferDisabled} onClick={() => picker.current.click()}><Upload size={20} aria-hidden="true" />Import saves</button>
          </div>
          {needsImportGame && <label className="settings-save-choice">Game for imported saves
            <select value={importGame} disabled={busy} onChange={chooseImportGame}>
              <option value="">Detect automatically</option>
              {data.destinations.filter(({ key }) => key !== "shared").map(({ key, title }) => <option key={key} value={key}>{title}</option>)}
            </select>
          </label>}
        </div>
      </>}
      {review && <div className="settings-review"><h3 tabIndex={-1} ref={reviewHeading}>Review import</h3>
        <p>Saves are matched to their games automatically. Games missing from this backup stay unchanged.</p>
        {review.rows.map((row, index) => {
          if (!row.destinationKey) return null;
          const active = data.sets.find((set) => set.destination.key === row.destinationKey);
          const identical = active?.hash === row.set.hash;
          return <fieldset key={index} className="settings-review-game"><legend>{row.set.destination.title}</legend>
            {identical ? <p className="settings-active"><Check size={17} />Identical saves — nothing to change.</p>
              : <p>{formatSaveCount(row.set.files.length)} · {row.choice === "stored" ? "Keep as a backup" : "Ready to import"}</p>}
          </fieldset>;
        })}
        {unmatchedCount > 0 && <fieldset className="settings-review-game">
          <legend>{unmatchedCount} unmatched save {unmatchedCount === 1 ? "set" : "sets"}</legend>
          <p>These saves will be kept as backups. Add the matching game to find them under Backed-up saves in Load Game.</p>
        </fieldset>}
        {replacingProgress && <p className="settings-reassurance">Your current progress will be kept as a backup.</p>}
        <div className="settings-review-actions"><button type="button" className="secondary-button" disabled={busy} onClick={() => setReview(null)}>Cancel</button>
          <button type="button" className="launch-button" disabled={busy} onClick={confirmImport}>Import saves</button></div>
      </div>}
    </section>
    <button type="button" className={`settings-section-heading ${section === "privacy" ? "is-active" : ""}`}
      aria-expanded={section === "privacy"} aria-controls="settings-privacy"
      onClick={() => setSection(section === "privacy" ? "" : "privacy")}>
      <Shield size={24} aria-hidden="true" /><span>Privacy</span><ChevronDown size={20} aria-hidden="true" />
    </button>
    <section id="settings-privacy" hidden={section !== "privacy"} aria-label="Privacy permissions">
      <PrivacySettingsSwitches />
    </section>
    <button type="button" className={`settings-section-heading ${section === "about" ? "is-active" : ""}`}
      aria-expanded={section === "about"} aria-controls="settings-about" onClick={() => setSection(section === "about" ? "" : "about")}>
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
