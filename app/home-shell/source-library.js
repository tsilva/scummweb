"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { readRemoteGameArchive } from "../game-bucket.mjs";
import { getImportedGamePresentation } from "../game-presentation";
import { checkGameSource, localGame, readGameSources, removeGameSources, saveGameSources } from "../game-sources.mjs";
import { readGameFolder, readLocalGameArchive, selectGameArchive, validateGameZip } from "../local-game-archive.mjs";
import {
  fileNode, handleNode, openLocalFolder, prepareLocalFolder, prepareLocalZip, scanGameFolder, selectedGameFolder,
} from "../local-game-import.mjs";
import LibraryCards, { GamePoster } from "./library-cards";
import GameDropOverlay, { chooseZipHandles } from "./local-game";

const sessionGames = new Map();
const sessionSources = new Map();
const reducedMotionQuery = "(prefers-reduced-motion: reduce)";
const statusText = {
  checking: "Checking availability…",
  available: "Available",
  permission: "File access needed",
  missing: "Unavailable",
  unverified: "Could not check availability",
  session: "Available in this tab",
  locate: "ZIP selection needed",
};

function scrollToLibraryItem(item, block) {
  const behavior = window.matchMedia(reducedMotionQuery).matches ? "instant" : "smooth";
  item?.scrollIntoView({ behavior, block });
}

export default function SourceLibrary({ catalog, officialUrl }) {
  const router = useRouter();
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [addedIds, setAddedIds] = useState(null);
  const revealObserver = useRef(null);
  const working = useRef(false);
  const [pending, setPending] = useState([]);
  const [importResult, setImportResult] = useState(null);
  const fileInput = useRef(null);
  const folderInput = useRef(null);
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
        const check = sessionGames.has(source.id) ? Promise.resolve("session") : checkGameSource(source);
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

  useEffect(() => {
    if (window.matchMedia(reducedMotionQuery).matches) return;

    const highlight = "grayscale(0) brightness(1.35) contrast(1.04) saturate(1.2)";
    const visibleThreshold = 0.25;
    const observer = new IntersectionObserver((visibleCards) => {
      for (const { intersectionRatio, target } of visibleCards) {
        if (intersectionRatio < visibleThreshold) continue;
        observer.unobserve(target);
        target.querySelector(".poster-media-image, .bucket-poster-placeholder")?.animate([
          { filter: highlight, offset: 0.25 },
          { filter: highlight, offset: 0.65 },
        ], { duration: 1800, easing: "ease-in-out" });
      }
    }, { threshold: visibleThreshold });
    revealObserver.current = observer;
    return () => {
      observer.disconnect();
      revealObserver.current = null;
    };
  }, []);

  useEffect(() => {
    if (!addedIds) return;
    const cards = [...document.querySelectorAll("#library [data-library-source-id]")]
      .filter((card) => addedIds.has(card.dataset.librarySourceId));
    cards.forEach((card) => revealObserver.current?.observe(card));
    scrollToLibraryItem(cards[0], "center");
  }, [addedIds]);

  function updateEntries(sources) {
    const ids = new Set(sources.map(({ id }) => id));
    setEntries((current) => [
      ...current.filter(({ source }) => !ids.has(source.id)),
      ...sources.map((source) => ({ source, status: sessionGames.has(source.id) ? "session" : "available" })),
    ]);
  }

  async function removeSources(sources) {
    const ids = new Set(sources.map(({ id }) => id));
    const saved = sources.filter((source) => !sessionSources.has(source.id));
    if (saved.length) await removeGameSources(saved.map(({ id }) => id));
    for (const id of ids) {
      sessionSources.delete(id);
      sessionGames.delete(id);
    }
    setEntries((current) => current.filter(({ source }) => !ids.has(source.id)));
  }

  async function run(action, reportError = setNotice) {
    if (loading || working.current) return;
    working.current = true;
    setBusy(true);
    setNotice("");
    try {
      await action();
    } catch (error) {
      if (error?.name !== "AbortError") reportError(error?.message || "Could not update your game library.");
    } finally {
      working.current = false;
      setBusy(false);
    }
  }

  async function saveLocal(game, known, replacing) {
    let existing = replacing;
    if (game.handle && !existing) {
      for (const source of known.values()) {
        if (source.handle?.kind === game.handle.kind && await game.handle.isSameEntry(source.handle)) {
          existing = source;
          break;
        }
      }
    }

    const source = localGame(game.handle, game, existing?.id);
    try {
      await saveGameSources([source]);
      sessionSources.delete(source.id);
    } catch (error) {
      if (existing && !sessionSources.has(existing.id)) throw error;
      sessionSources.set(source.id, source);
    }
    if (game.handle && !sessionSources.has(source.id)) {
      sessionGames.delete(source.id);
    } else {
      sessionGames.set(source.id, game.data);
    }
    known.set(source.id, source);
    updateEntries([source]);
    return { id: source.id, temporary: sessionSources.has(source.id), needsSelection: !game.handle };
  }

  function importRoots(selection, replacing) {
    return run(async () => {
      const roots = typeof selection === "function" ? await selection() : selection;
      if (!roots.length) return;
      const known = new Map(entries.map(({ source }) => [source.id, source]));
      const items = [];
      const savedIds = new Set();
      let temporary = 0;
      let needsSelection = 0;

      function updateProgress(index, details) {
        setPending((current) => current.map((item) => item.index === index ? { ...item, ...details } : item));
      }

      async function save(game) {
        const result = await saveLocal(game, known, replacing);
        savedIds.add(result.id);
        items.push({ label: game.name, message: replacing ? "Reconnected" : "Added to your library" });
        if (result.temporary) temporary++;
        else if (result.needsSelection) needsSelection++;
      }

      setPending(roots.map((root, index) => ({ index, label: root.name ?? "Game files", message: "Waiting to scan…" })));
      try {
        for (const [index, root] of roots.entries()) {
          let label = "Dropped item";
          try {
            const node = await root;
            if (!node) throw new Error("Could not read this item. Try dropping it again.");
            label = node.name;
            updateProgress(index, { label, message: node.kind === "directory" ? "Scanning folder…" : "Checking ZIP…" });

            if (node.kind === "file") {
              await save(await prepareLocalZip(node));
            } else {
              const { archives, files } = await scanGameFolder(node, (count) => {
                updateProgress(index, { message: `Scanning folder… ${count} items checked` });
              });
              if (!archives.length || replacing) {
                await save(await prepareLocalFolder(node, files));
              } else {
                for (const [position, archive] of archives.entries()) {
                  updateProgress(index, {
                    message: `Checking ZIP ${position + 1} of ${archives.length}…`,
                    value: position,
                    total: archives.length,
                  });
                  try {
                    await save(await prepareLocalZip(archive));
                  } catch (error) {
                    items.push({ label: archive.name, message: error.message, skipped: true });
                  }
                }
              }
            }
          } catch (error) {
            items.push({ label, message: error.message, skipped: true });
          } finally {
            setPending((current) => current.filter((item) => item.index !== index));
          }
        }
      } finally {
        setPending([]);
      }

      setImportResult({ savedIds, items, replacing, temporary, needsSelection });
    }, (message) => setImportResult({
      savedIds: new Set(),
      items: [{ label: "Game files", message, skipped: true }],
    }));
  }

  function confirmImport() {
    if (!importResult.replacing && importResult.savedIds.size) setAddedIds(importResult.savedIds);
    setImportResult(null);
  }

  function chooseZip(replacing = null) {
    if (typeof window.showOpenFilePicker === "function") {
      importRoots(async () => (await chooseZipHandles(!replacing)).map(handleNode), replacing);
    } else {
      replacingSource.current = replacing;
      fileInput.current.multiple = !replacing;
      fileInput.current.click();
    }
  }

  function chooseFolder(replacing = null) {
    if (typeof window.showDirectoryPicker === "function") {
      importRoots(async () => [handleNode(await window.showDirectoryPicker({ mode: "read" }))], replacing);
    } else {
      replacingSource.current = replacing;
      folderInput.current.click();
    }
  }

  function chooseLocal(source) {
    if (source.kind === "folder") chooseFolder(source);
    else chooseZip(source);
  }

  function updateStatus(source, status) {
    setEntries((current) => current.map((entry) =>
      entry.source === source ? { source, status } : entry
    ));
  }

  function play(source, game) {
    return run(async () => {
      if (source.url) {
        selectGameArchive((signal) => readRemoteGameArchive(source.url, { signal }), game);
      } else {
        const data = sessionGames.get(source.id);
        if (!data && !source.handle) {
          updateStatus(source, "locate");
          setNotice("Locate the game files to play again.");
          return;
        }
        if (!data) {
          if (await source.handle.requestPermission({ mode: "read" }) !== "granted") {
            updateStatus(source, "locate");
            setNotice("Locate the game files to grant access again.");
            return;
          }
        }
        if (source.kind === "folder") {
          selectGameArchive(() => data ? readGameFolder(data) : openLocalFolder(source.handle), game);
        } else {
          try {
            const file = data ?? await source.handle.getFile();
            validateGameZip(file);
            selectGameArchive(() => readLocalGameArchive(file), game);
          } catch {
            updateStatus(source, "missing");
            setNotice("Could not open the ZIP. Locate the file to reconnect it.");
            return;
          }
        }
      }
      router.push("/local/play");
    });
  }

  const disabled = loading || busy || Boolean(importResult);

  return (
    <>
      <input ref={fileInput} type="file" accept=".zip,application/zip" multiple hidden
        onChange={(event) => {
          const files = [...event.target.files];
          if (files.length) importRoots(files.map(fileNode), replacingSource.current);
          event.target.value = "";
        }} />
      <input ref={folderInput} type="file" webkitdirectory="" multiple hidden
        onChange={(event) => {
          const files = [...event.target.files];
          if (files.length) importRoots([selectedGameFolder(files)], replacingSource.current);
          event.target.value = "";
        }} />
      <GameDropOverlay importRoots={importRoots} disabled={disabled} pending={pending}
        result={importResult} onConfirm={confirmImport} />
      <p className="local-game-status" role="status">{notice}</p>
      <LibraryCards games={catalog}>
        {entries.map(({ source, status }) => {
          const game = catalog.find(({ target }) => target === source.target)
            ?? getImportedGamePresentation(source.kind === "folder" ? source.name + ".zip" : source.name);
          const title = game?.displayTitle ?? source.name.replace(/\.zip$/i, "");
          const locate = !source.url && ["missing", "locate"].includes(status);
          const locateLabel = source.kind === "folder" ? "Locate folder" : "Locate ZIP";
          const action = locate ? `${locateLabel} for` : "Play";
          const hint = locate ? locateLabel : ["permission", "missing", "unverified"].includes(status)
            ? statusText[status] : null;
          const description = [game?.studio, game?.year, game?.badge, statusText[status]].filter(Boolean).join(" · ");
          return (
            <article key={source.id} className="poster-entry source-poster-entry" data-library-source-id={source.id}>
              <button
                type="button"
                className={`poster-card source-poster-card ${game?.tone ?? "tone-default"}`}
                disabled={disabled || status === "checking"}
                aria-label={`${action} ${title}`}
                aria-description={description}
                title={description}
                onClick={() => locate ? chooseLocal(source) : play(source, game)}
              >
                <GamePoster title={title} image={game?.posterImage} />
                {hint && <span className="source-poster-hint" aria-hidden="true">{hint}</span>}
              </button>
              <button
                type="button"
                className="source-poster-remove"
                disabled={disabled}
                aria-label={`Remove ${title} from your library`}
                onClick={() => run(() => removeSources([source]))}
              >
                <X aria-hidden="true" size={18} />
              </button>
            </article>
          );
        })}
      </LibraryCards>
    </>
  );
}
