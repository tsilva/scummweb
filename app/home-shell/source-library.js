"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { readRemoteGameArchive } from "../game-bucket.mjs";
import { checkGameSource, localGame, readGameSources, removeGameSources, saveGameSources } from "../game-sources.mjs";
import { readLocalGameArchive, selectGameArchive, validateGameZip } from "../local-game-archive.mjs";
import GameBucket from "./game-bucket";
import LibraryCards, { GamePoster } from "./library-cards";
import LocalGame, { chooseZipHandle } from "./local-game";

const sessionFiles = new Map();
const sessionSources = new Map();
const statusText = {
  checking: "Checking availability…",
  available: "Available",
  permission: "File access needed",
  missing: "Unavailable",
  unverified: "Could not check availability",
  session: "Available in this tab",
  locate: "ZIP selection needed",
};

export default function SourceLibrary({ catalog, officialUrl }) {
  const router = useRouter();
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const working = useRef(false);
  const fileInput = useRef(null);
  const replacingSource = useRef(null);

  useEffect(() => {
    let active = true;
    async function restore() {
      let saved = [];
      try {
        saved = await readGameSources(catalog, officialUrl);
      } catch {
        if (active) setNotice("Could not load saved games from this browser.");
      }
      if (!active) return;
      const sourcesById = new Map(saved.map((source) => [source.id, source]));
      for (const [id, source] of sessionSources) sourcesById.set(id, source);
      const sources = [...sourcesById.values()];
      setEntries(sources.map((source) => ({ source, status: "checking" })));
      setLoading(false);

      for (const source of sources) {
        const check = sessionFiles.has(source.id) ? Promise.resolve("session") : checkGameSource(source);
        void check.then((status) => {
          if (active) {
            setEntries((current) => current.map((entry) =>
              entry.source === source ? { source, status } : entry
            ));
          }
        });
      }
    }
    void restore();
    return () => { active = false; };
  }, [catalog, officialUrl]);

  function updateEntries(sources) {
    const ids = new Set(sources.map(({ id }) => id));
    setEntries((current) => [
      ...current.filter(({ source }) => !ids.has(source.id)),
      ...sources.map((source) => ({ source, status: sessionFiles.has(source.id) ? "session" : "available" })),
    ]);
  }

  async function saveSources(sources) {
    const saved = sources.map((source) => {
      const previous = entries.find((entry) => entry.source.id === source.id)?.source;
      return { ...previous, ...source };
    });
    await saveGameSources(saved);
    updateEntries(saved);
  }

  async function removeSources(sources) {
    const ids = new Set(sources.map(({ id }) => id));
    const saved = sources.filter((source) => !sessionSources.has(source.id));
    if (saved.length) await removeGameSources(saved.map(({ id }) => id));
    for (const id of ids) {
      sessionSources.delete(id);
      sessionFiles.delete(id);
    }
    setEntries((current) => current.filter(({ source }) => !ids.has(source.id)));
  }

  async function run(action) {
    if (loading || working.current) return;
    working.current = true;
    setBusy(true);
    setNotice("");
    try {
      await action();
    } catch (error) {
      if (error?.name !== "AbortError") setNotice(error?.message || "Could not update your game library.");
    } finally {
      working.current = false;
      setBusy(false);
    }
  }

  function addLocal(pickFile, replacing) {
    return run(async () => {
      const { handle, file } = await pickFile();
      validateGameZip(file);
      const fileHandle = handle?.kind === "file" ? handle : null;
      let existing = replacing;
      if (fileHandle && !existing) {
        for (const { source } of entries) {
          if (source.handle && await fileHandle.isSameEntry(source.handle)) {
            existing = source;
            break;
          }
        }
      }

      const source = localGame(fileHandle, file, existing?.id);
      try {
        await saveGameSources([source]);
        sessionSources.delete(source.id);
        setNotice(fileHandle
          ? (existing ? "ZIP reconnected." : "ZIP saved to your library.")
          : "Game saved. This browser will ask you to locate the ZIP after a reload.");
      } catch (error) {
        if (existing && !sessionSources.has(existing.id)) throw error;
        sessionSources.set(source.id, source);
        setNotice("Browser storage is unavailable. This game is available in this tab.");
      }
      if (fileHandle && !sessionSources.has(source.id)) {
        sessionFiles.delete(source.id);
      } else {
        sessionFiles.set(source.id, file);
      }
      updateEntries([source]);
    });
  }

  function chooseZip(replacing = null) {
    if (typeof window.showOpenFilePicker === "function") {
      addLocal(async () => {
        const handle = await chooseZipHandle();
        return { handle, file: await handle.getFile() };
      }, replacing);
    } else {
      replacingSource.current = replacing;
      fileInput.current.click();
    }
  }

  function updateStatus(source, status) {
    setEntries((current) => current.map((entry) =>
      entry.source === source ? { source, status } : entry
    ));
  }

  function play(source) {
    return run(async () => {
      if (source.url) {
        selectGameArchive((signal) => readRemoteGameArchive(source.url, { signal }));
      } else {
        let file = sessionFiles.get(source.id);
        if (!file && !source.handle) {
          updateStatus(source, "locate");
          setNotice("Locate the ZIP to play this game.");
          return;
        }
        if (!file) {
          if (await source.handle.requestPermission({ mode: "read" }) !== "granted") {
            updateStatus(source, "permission");
            setNotice("Allow access to play this ZIP, or locate it again.");
            return;
          }
          try {
            file = await source.handle.getFile();
            validateGameZip(file);
          } catch {
            updateStatus(source, "missing");
            setNotice("Could not open the ZIP. Locate the file to reconnect it.");
            return;
          }
        }
        selectGameArchive(() => readLocalGameArchive(file));
      }
      router.push("/local/play");
    });
  }

  const disabled = loading || busy;
  const buckets = [...new Set(entries.flatMap(({ source }) => source.bucket ? [source.bucket] : []))];

  return (
    <>
      <input ref={fileInput} type="file" accept=".zip,application/zip" hidden
        onChange={(event) => {
          const file = event.target.files[0];
          if (file) addLocal(() => ({ file }), replacingSource.current);
          event.target.value = "";
        }} />
      <LocalGame addLocal={addLocal} chooseZip={chooseZip} disabled={disabled} />
      <p className="local-game-status" role="status">{notice}</p>
      <GameBucket catalog={catalog} officialUrl={officialUrl} saveSources={saveSources} disabled={disabled}
        buckets={buckets}
        removeBucket={(bucket) => removeSources(entries.map(({ source }) => source).filter((source) => source.bucket === bucket))} />
      <LibraryCards games={catalog}>
        {entries.map(({ source, status }) => {
          const game = catalog.find(({ target }) => target === source.target);
          const title = game?.displayTitle ?? source.name.replace(/\.zip$/i, "");
          const canLocate = !source.url && ["permission", "missing", "locate"].includes(status);
          const canPlay = !canLocate || status === "permission";
          return (
            <article key={source.id} className="poster-entry">
              <div className={`poster-card ${game?.tone ?? "tone-default"}`}>
                <GamePoster title={title} image={game?.posterImage} />
              </div>
              <div className="source-details">
                <p>{source.url ? new URL(source.url).hostname : "Local ZIP"} · {statusText[status]}</p>
                <div className="game-source-actions">
                  {canPlay && (
                    <button type="button" className="secondary-button" disabled={disabled || status === "checking"}
                      aria-label={`Play ${title}`} onClick={() => play(source)}>Play</button>
                  )}
                  {canLocate && (
                    <button type="button" className="secondary-button" disabled={disabled}
                      aria-label={`Locate ZIP for ${title}`} onClick={() => chooseZip(source)}>Locate ZIP</button>
                  )}
                  <button type="button" className="secondary-button" disabled={disabled}
                    aria-label={`Remove ${title} from your library`}
                    onClick={() => run(() => removeSources([source]))}>Remove</button>
                </div>
              </div>
            </article>
          );
        })}
      </LibraryCards>
    </>
  );
}
