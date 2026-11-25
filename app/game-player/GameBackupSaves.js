import { ChevronDown, ChevronRight } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { parseAutosave } from "../../web-shell/rotating-autosaves.mjs";
import { openSaveStorage } from "../../web-shell/save-storage.mjs";
import { getActiveSaveSets, readStoredSets } from "../save-backups/backups.mjs";
import { dropboxEnabled } from "../dropbox/bridge.mjs";

const formatDate = new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "medium" });
const backupsPerPage = 12;

function BackupSlots({ slots, disabled, onLoad }) {
  return <ul className="game-menu-slots">
    {slots.map(save => <li key={save.id}>
      <button disabled={disabled} onClick={() => onLoad({ slot: save.slot, files: save.files })} type="button">
        <span>
          <strong>{save.description?.trim() || `Save ${save.slot}`}</strong>
          {Number.isFinite(new Date(save.modifiedAt).getTime()) && <small>{formatDate.format(save.modifiedAt)}</small>}
        </span>
        <ChevronRight aria-hidden="true" size={22} />
      </button>
    </li>)}
  </ul>;
}

async function readCopies(key, fingerprint) {
  const catalog = key.startsWith("catalog:");
  const destinations = [{ key, fingerprint, family: catalog ? key.slice(8) : null, namespace: catalog ? "" : key }];
  const stored = await readStoredSets(destinations);
  if (!stored.length) return [];
  const hashes = new Set();
  try {
    const { sets } = await getActiveSaveSets(await openSaveStorage(), destinations);
    for (const set of sets) if (set.destination.key === key) hashes.add(set.hash);
  } catch {
    // An unreadable active save tree should not hide playable backups.
  }
  return stored.filter(({ hash }) => {
    if (hashes.has(hash)) return false;
    hashes.add(hash);
    return true;
  });
}

function copySlots(playerWindow, copy) {
  const native = copy.files.filter(({ path }) => !/^\.scummweb-autosave\.[0-2]$/.test(path));
  const slots = native.length ? playerWindow.scummwebPlayerControls.listBackup(native) : [];
  const identity = playerWindow.__scummwebSaveStatus;
  return [
    ...(slots || []).map(save => ({ ...save, files: native })),
    ...copy.files.flatMap(({ path, data }) => {
      if (!/^\.scummweb-autosave\.[0-2]$/.test(path)) return [];
      const record = parseAutosave(new TextDecoder().decode(data));
      if (!record || !["engineId", "gameId", "target", "extra"].every(key => record[key] === identity?.[key])) return [];
      return [{ name: path, slot: record.slot, description: "Autosave", modifiedAt: record.savedAt, files: record.files }];
    }),
  ].map(save => ({ ...save, id: `${copy.id}:${save.name}` }));
}

export default function GameBackupSaves({ destinationKey, fingerprint, frameRef, disabled, onLoad }) {
  const [copies, setCopies] = useState([]);
  const [expanded, setExpanded] = useState(false);
  const [slots, setSlots] = useState(null);
  const [error, setError] = useState("");
  const [cloudCopies, setCloudCopies] = useState(null);
  const [cloudSlots, setCloudSlots] = useState(null);
  const [cloudError, setCloudError] = useState("");
  const [selected, setSelected] = useState(null);
  const [visibleCloudCount, setVisibleCloudCount] = useState(backupsPerPage);
  const download = useRef(null);
  const cloud = dropboxEnabled();

  useEffect(() => {
    let cancelled = false;
    void readCopies(destinationKey, fingerprint).then(result => {
      if (!cancelled) setCopies(result);
    }, () => {
      if (!cancelled) setError("Could not read backed-up saves.");
    });
    return () => { cancelled = true; };
  }, [destinationKey, fingerprint]);

  useEffect(() => {
    if (!expanded || slots || !copies.length) return;
    let cancelled = false;
    async function scan() {
      const found = [];
      for (const copy of copies) {
        // Let the drawer repaint and respond to dismissal between native scans.
        await new Promise(resolve => setTimeout(resolve, 0));
        if (cancelled) return;
        try {
          found.push(...copySlots(frameRef.current.contentWindow, copy));
        } catch {
          // A damaged copy cannot prevent opening the other backups.
        }
      }
      found.sort((a, b) => b.modifiedAt - a.modifiedAt || a.slot - b.slot);
      setSlots(found);
    }
    void scan();
    return () => { cancelled = true; };
  }, [copies, expanded, frameRef, slots]);

  useEffect(() => {
    if (!expanded || !cloud) return;
    const controller = new AbortController();
    setCloudError("");
    void import("../dropbox/runtime.mjs").then(runtime =>
      runtime.listDropboxBackups({ key: destinationKey, fingerprint }, controller.signal)
    ).then(versions => {
      if (!controller.signal.aborted) setCloudCopies(versions);
    }, failure => {
      if (!controller.signal.aborted) setCloudError(failure.message || "Could not list Dropbox backups.");
    });
    return () => {
      controller.abort();
      download.current?.abort();
      setCloudCopies(null);
      setCloudSlots(null);
      setSelected(null);
      setVisibleCloudCount(backupsPerPage);
    };
  }, [cloud, destinationKey, expanded, fingerprint]);

  async function selectCloudCopy(hash) {
    download.current?.abort();
    if (selected === hash && !cloudError) {
      setSelected(null);
      setCloudSlots(null);
      return;
    }
    const controller = new AbortController();
    download.current = controller;
    setSelected(hash);
    setCloudSlots(null);
    setCloudError("");
    try {
      const { downloadDropboxBackup } = await import("../dropbox/runtime.mjs");
      const copy = await downloadDropboxBackup({ key: destinationKey, fingerprint }, hash, controller.signal);
      if (!controller.signal.aborted) setCloudSlots(copySlots(frameRef.current.contentWindow, { ...copy, id: hash }));
    } catch (failure) {
      if (!controller.signal.aborted) setCloudError(failure.message || "Could not download the Dropbox backup.");
    }
  }

  if (!copies.length && !cloud) return error ? <p className="game-menu-note" role="status">{error}</p> : null;
  const localHashes = new Set(copies.map(({ hash }) => hash));
  const availableCloud = cloudCopies?.filter(({ hash }) => !localHashes.has(hash));
  return <section className="game-menu-backups">
    <button
      aria-controls="game-menu-backed-up-slots"
      aria-expanded={expanded}
      className="game-menu-backups-toggle"
      disabled={disabled}
      onClick={() => setExpanded(!expanded)}
      type="button"
    >
      Backed-up saves <ChevronDown aria-hidden="true" size={17} />
    </button>
    <div id="game-menu-backed-up-slots" hidden={!expanded}>
      {expanded && <>
        {error && <p className="game-menu-note" role="status">{error}</p>}
        {slots?.length > 0 && <BackupSlots slots={slots} disabled={disabled} onLoad={onLoad} />}
        {cloud && availableCloud?.length > 0 && <>
          <ul className="game-menu-slots">
            {availableCloud.slice(0, visibleCloudCount).map(({ hash, savedAt }) => <li key={hash}>
              <button disabled={disabled} type="button" onClick={() => void selectCloudCopy(hash)} aria-expanded={selected === hash}>
                <span>
                  <strong>Dropbox backup</strong>
                  {Number.isFinite(new Date(savedAt).getTime()) && <small>{formatDate.format(savedAt)}</small>}
                </span>
                <ChevronRight aria-hidden="true" size={22} />
              </button>
              {selected === hash && !cloudError && (cloudSlots?.length
                ? <BackupSlots slots={cloudSlots} disabled={disabled} onLoad={onLoad} />
                : <p className="game-menu-note" role="status">
                  {cloudSlots ? "No loadable saves in this backup." : "Downloading Dropbox backup…"}
                </p>)}
            </li>)}
          </ul>
          {availableCloud.length > visibleCloudCount && <button className="game-menu-backups-toggle" type="button"
            disabled={disabled} onClick={() => setVisibleCloudCount(count => count + backupsPerPage)}>Show older Dropbox backups</button>}
        </>}
        {cloudError && <p className="game-menu-note" role="status">{cloudError}</p>}
        {!cloudError && (cloud && !cloudCopies || copies.length > 0 && !slots) &&
          <p className="game-menu-note" role="status">Checking backed-up saves…</p>}
        {!cloudError && !slots?.length && (!cloud || availableCloud?.length === 0) &&
          (!copies.length || slots) && <p className="game-menu-note" role="status">No loadable saves were found in these backups.</p>}
      </>}
    </div>
  </section>;
}
