import { ChevronDown, ChevronRight } from "lucide-react";
import { useEffect, useState } from "react";
import { parseAutosave } from "../../web-shell/rotating-autosaves.mjs";
import { openSaveStorage } from "../../web-shell/save-storage.mjs";
import { getActiveSaveSets, readStoredSets } from "../save-backups/backups.mjs";

const formatDate = new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "medium" });

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

  if (error) return <p className="game-menu-note" role="status">{error}</p>;
  if (!copies.length) return null;
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
      {expanded && (slots?.length ? <ul className="game-menu-slots">
        {slots.map(save => (
          <li key={save.id}>
            <button disabled={disabled} onClick={() => onLoad({ slot: save.slot, files: save.files })} type="button">
              <span>
                <strong>{save.description?.trim() || `Save ${save.slot}`}</strong>
                {Number.isFinite(new Date(save.modifiedAt).getTime()) && <small>{formatDate.format(save.modifiedAt)}</small>}
              </span>
              <ChevronRight aria-hidden="true" size={22} />
            </button>
          </li>
        ))}
      </ul> : <p className="game-menu-note" role="status">
        {slots ? "No loadable saves were found in these backups." : "Checking backed-up saves…"}
      </p>)}
    </div>
  </section>;
}
