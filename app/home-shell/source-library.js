"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { readRemoteGameArchive } from "../game-bucket.mjs";
import { getGamePresentation, getImportedGamePresentation } from "../game-presentation";
import { checkGameSource, localGame, readGameSources, removeGameSources, saveGameSources } from "../game-sources.mjs";
import { findLocalGameSource } from "../local-game-matching.mjs";
import { maxLocalGameSize, openLocalGameZip, readGameFolder, selectGameArchive, validateGameZip } from "../local-game-archive.mjs";
import {
  fileNode, handleNode, openLocalFolder, prepareLocalFolder, prepareLocalZip, scanGameFolder, selectedGameFolder,
} from "../local-game-import.mjs";
import { GamePoster } from "./library-cards";
import LibraryView from "./library-view";
import HomeHero from "./home-hero";
import GameDetailModal from "./game-detail-modal";
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
  locate: "Game files need locating",
};

function scrollToLibraryItem(item, block) {
  const behavior = window.matchMedia(reducedMotionQuery).matches ? "instant" : "smooth";
  item?.scrollIntoView({ behavior, block });
}

const reconnectStatuses = new Set(["locate", "missing", "permission"]);

export default function SourceLibrary({ catalog, children, featuredGame, libraryHeading, officialUrl }) {
  const router = useRouter();
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [detailSourceId, setDetailSourceId] = useState(null);
  const closeDetails = useCallback(() => setDetailSourceId(null), []);
  const [addedIds, setAddedIds] = useState(null);
  const revealObserver = useRef(null);
  const working = useRef(false);
  const [pending, setPending] = useState([]);
  const [importResult, setImportResult] = useState(null);
  const fileInput = useRef(null);
  const folderInput = useRef(null);
  const replacingSource = useRef(null);
  const entriesRef = useRef([]);

  useEffect(() => {
    entriesRef.current = entries;
  }, [entries]);

  useEffect(() => {
    let active = true;
    const checking = new Set();

    function checkSources(sources) {
      for (const source of sources) {
        if (checking.has(source)) continue;
        checking.add(source);
        // Only imports without a persistent handle rely on their in-memory copy.
        const check = !source.handle && sessionGames.has(source.id)
          ? Promise.resolve("session") : checkGameSource(source);
        void check.then((status) => {
          if (active) {
            setEntries((current) => current.map((entry) =>
              entry.source === source ? { source, status } : entry
            ));
          }
        }).finally(() => checking.delete(source));
      }
    }

    function recheck() {
      if (!document.hidden && !working.current) {
        checkSources(entriesRef.current.map(({ source }) => source));
      }
    }

    function onPageShow(event) {
      if (event.persisted) recheck();
    }

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

      checkSources(sources);
    }
    window.addEventListener("focus", recheck);
    window.addEventListener("pageshow", onPageShow);
    document.addEventListener("visibilitychange", recheck);
    void restore();
    return () => {
      active = false;
      window.removeEventListener("focus", recheck);
      window.removeEventListener("pageshow", onPageShow);
      document.removeEventListener("visibilitychange", recheck);
    };
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

  async function saveLocal(game, known, existing) {
    const source = { ...existing, ...localGame(game.handle, game, existing?.id) };
    // A fallback picker must replace a stale saved handle with its fresh in-memory files.
    if (!game.handle) delete source.handle;
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
    return { id: source.id, temporary: sessionSources.has(source.id) };
  }

  function importRoots(selection, replacing) {
    return run(async () => {
      const roots = typeof selection === "function" ? await selection() : selection;
      if (!roots.length) return;
      const known = new Map(entries.map(({ source }) => [source.id, source]));
      const items = [];
      const savedIds = new Set();
      let temporary = 0;
      let scanOrder = 0;
      const reconnectable = new Set(entries.filter(({ source, status }) =>
        !source.url && !sessionGames.has(source.id) && (reconnectStatuses.has(status) || !source.handle)
      ).map(({ source }) => source.id));

      function updateProgress(index, details) {
        const order = ++scanOrder;
        setPending((current) => current.map((item) => item.index === index ? { ...item, ...details, scanOrder: order } : item));
      }

      async function save(game, label = game.name) {
        const reconnect = replacing ?? await findLocalGameSource(game, known.values(), reconnectable);
        const result = await saveLocal(game, known, reconnect);
        const firstSave = !savedIds.has(result.id);
        savedIds.add(result.id);
        reconnectable.delete(result.id);
        const item = {
          label,
          status: reconnect ? "skipped" : "added",
          message: reconnect ? "Already in your library. Files refreshed." : "Added to your library",
        };
        items.push(item);
        if (firstSave && result.temporary) temporary++;
        return item;
      }

      setPending(roots.map((root, index) => ({ index, label: root.name ?? "Game files", container: root.kind === "directory", message: "Waiting to scan…" })));
      try {
        for (const [index, root] of roots.entries()) {
          let label = "Dropped item";
          let fileItems = [];
          function updateFile(position, details) {
            const order = ++scanOrder;
            fileItems = fileItems.map((item, itemIndex) => itemIndex === position ? { ...item, ...details, scanOrder: order } : item);
            updateProgress(index, { files: fileItems });
          }
          try {
            const node = await root;
            if (!node) throw new Error("Could not read this item. Try dropping it again.");
            label = node.name;
            updateProgress(index, { label, container: node.kind === "directory", message: node.kind === "directory" ? "Scanning folder…" : "Checking ZIP…" });

            if (node.kind === "file") {
              const item = await save(await prepareLocalZip(node));
              updateProgress(index, item);
            } else {
              const { archives, files } = await scanGameFolder(node, (count) => {
                updateProgress(index, { message: `Scanning folder… ${count} items checked` });
              });
              if (!archives.length || replacing) {
                fileItems = files.map(({ path }) => ({ label: path, message: "Waiting…" }));
                updateProgress(index, { message: "Checking game files…", files: fileItems });
                const game = await prepareLocalFolder(node, files, updateFile);
                const item = await save(game);
                fileItems = fileItems.map((file) => ({
                  ...file, status: item.status,
                  message: item.status === "skipped" ? "Refreshed with game folder" : "Added with game folder", complete: true,
                }));
                item.files = fileItems;
                updateProgress(index, { ...item, files: fileItems });
              } else {
                fileItems = archives.map((archive) => ({ label: archive.path, message: "Waiting…" }));
                updateProgress(index, { files: fileItems });
                for (const [position, archive] of archives.entries()) {
                  updateProgress(index, {
                    message: `Checking ZIP ${position + 1} of ${archives.length}…`,
                    value: position,
                    total: archives.length,
                  });
                  updateFile(position, { message: "Checking ZIP…" });
                  try {
                    const item = await save(await prepareLocalZip(archive), archive.path);
                    updateFile(position, { ...item, complete: true });
                  } catch (error) {
                    const item = { label: archive.path, message: error.message, status: "error" };
                    items.push(item);
                    updateFile(position, item);
                  }
                }
                updateProgress(index, {
                  message: `${archives.length} ZIPs checked`, value: archives.length, total: archives.length,
                  status: fileItems.some((item) => item.status === "error") ? "error"
                    : fileItems.every((item) => item.status === "skipped") ? "skipped" : "added",
                });
              }
            }
          } catch (error) {
            fileItems = fileItems.map((file) => ({ ...file, message: "Game folder was not added", status: "error" }));
            items.push({ label, message: error.message, status: "error", files: fileItems });
            updateProgress(index, { message: error.message, status: "error", files: fileItems });
          } finally {
            updateProgress(index, { complete: true });
          }
        }
      } finally {
        setPending([]);
      }

      setImportResult({ savedIds, items, replacing, temporary });
    }, (message) => setImportResult({
      savedIds: new Set(),
      items: [{ label: "Game files", message, status: "error" }],
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
            validateGameZip(file, maxLocalGameSize);
            selectGameArchive((signal) => openLocalGameZip(file, signal), game);
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
  const library = entries.map(({ source, status }) => {
    const knownGame = catalog.find(({ target }) => target === source.target)
      ?? getImportedGamePresentation(source.kind === "folder" ? source.name + ".zip" : source.name);
    const title = knownGame?.displayTitle ?? source.name.replace(/\.zip$/i, "");
    const game = knownGame ?? getGamePresentation({ displayTitle: title }, {
      summary: "Play this game from your library.",
      badge: "Library game",
    });
    const locate = !source.url && ["missing", "locate"].includes(status);
    const locateLabel = source.kind === "folder" ? "Locate folder" : "Locate ZIP";
    return {
      source, status, game, title, locate, locateLabel,
      action: {
        label: locate ? `${locateLabel} for ${title}` : `Play ${title}`,
        disabled: disabled || status === "checking",
        onClick: () => locate ? chooseLocal(source) : play(source, knownGame),
      },
    };
  });
  const detail = library.find(({ source }) => source.id === detailSourceId);

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
      {featuredGame && <HomeHero catalog={catalog} featuredGame={featuredGame} library={library} />}
      <div className="section-stack">
        {children}
        <LibraryView catalog={catalog} library={library} heading={libraryHeading} notice={notice}>
            {({ source, status, game, title, locate, locateLabel, action }) => {
              const hint = status === "missing" && !source.url
                ? source.kind === "folder" ? "Game folder missing" : "Game file missing"
                : locate ? locateLabel : ["permission", "missing", "unverified"].includes(status)
                  ? statusText[status] : null;
              const description = [game?.summary, game?.studio, game?.genre, game?.badge, hint ?? statusText[status]].filter(Boolean).join(" · ");
              return (
                <article key={source.id} className="poster-entry source-poster-entry" data-library-source-id={source.id}>
                  <button
                    type="button"
                    className={`poster-card source-poster-card ${game?.tone ?? "tone-default"}`}
                    disabled={action.disabled}
                    aria-label={`View details for ${title}`}
                    aria-haspopup="dialog"
                    aria-controls={`source-game-${source.id}`}
                    aria-description={description}
                    title={description}
                    onClick={() => { setNotice(""); setDetailSourceId(source.id); }}
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
            }}
        </LibraryView>
      </div>
      {detail && <GameDetailModal game={detail.game} sourceId={detail.source.id}
        sourceAction={detail.action} notice={notice} onClose={closeDetails} />}
    </>
  );
}
