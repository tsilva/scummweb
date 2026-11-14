"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { exitImmersiveMode } from "../game-player/immersive-mode.mjs";
import { checkGameSource, isLocalArchiveSource, readGameSources, removeGameSources, requestGameSourceAccess, saveGameSources } from "../game-sources.mjs";
import { selectGameArchive, validateLocalGameArchive } from "../local-game-selection.mjs";
import { fileNode, handleNode } from "../game-import-nodes.mjs";
import { inspectLocalSourceFiles } from "../game-source-inspection.mjs";
import LibraryView from "./library-view";
import { catalogGameEntries, getGameFamilyKey, getVersionSaveNamespace, groupGameVersions, rememberGameVersion } from "../game-versions.mjs";
import { buildGameExitHref, readHeroSelection } from "./hero-selection.mjs";
import HomeHero from "./home-hero";
import GameDropOverlay, { chooseArchiveHandles } from "./local-game";
import RecentGamesRail from "../recent-games-rail";
import { GameNavigationContext } from "./game-navigation";
import BrowseMetadata from "./browse-metadata";
import { ArtworkDelivery } from "./artwork-delivery";
import { loadArtworkStorage } from "../../lib/artwork-storage.mjs";
import { removableLibraryVersions, restoreIncludedCatalog } from "./library-removal.mjs";

const sessionGames = new Map();
const sessionSources = new Map();
const reducedMotionQuery = "(prefers-reduced-motion: reduce)";

function scrollToLibraryItem(item, block) {
  const behavior = window.matchMedia(reducedMotionQuery).matches ? "instant" : "smooth";
  item?.scrollIntoView({ behavior, block });
}

async function loadSourcePresentation() {
  const [play, { getRecognizedGames }, { libraryItems }, artwork] = await Promise.all([
    import("../game-play-source.mjs"),
    import("../recognized-games.mjs"),
    import("./library-items.mjs"),
    loadArtworkStorage().catch(() => null),
  ]);
  return { ...play, getRecognizedGames, libraryItems, artwork };
}

export default function SourceLibrary({ catalog, artwork, featuredGame: initialFeaturedGame, isHomePage: initiallyHome = true, libraryHeading, officialUrl, onPlayArchive, playerRoute = false }) {
  const router = useRouter();
  const pathname = usePathname();
  const [entries, setEntries] = useState([]);
  const [sourcePresentation, setSourcePresentation] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState(null);
  const hasSources = entries.length > 0;
  const recognizedGames = useMemo(() => hasSources && sourcePresentation ? sourcePresentation.getRecognizedGames(catalog) : catalog,
    [catalog, hasSources, sourcePresentation]);
  const isHomePage = pathname === "/" || (!pathname && initiallyHome);
  const featuredGame = recognizedGames.find((game) => game.href === pathname) ?? initialFeaturedGame;
  const [selection, setSelection] = useState(null);
  const [navigationId, setNavigationId] = useState(0);
  const [addedIds, setAddedIds] = useState(null);
  const revealObserver = useRef(null);
  const working = useRef(false);
  const [pending, setPending] = useState([]);
  const [importResult, setImportResult] = useState(null);
  const fileInput = useRef(null);
  const replacingSource = useRef(null);
  const entriesRef = useRef([]);
  const [removals, setRemovals] = useState([]);

  function showNotice(message, tone = "error") {
    setNotice({ message, tone });
  }

  useEffect(() => {
    const sync = () => setSelection(readHeroSelection(window.location.hash));
    sync();
    window.addEventListener("hashchange", sync);
    window.addEventListener("popstate", sync);
    return () => {
      window.removeEventListener("hashchange", sync);
      window.removeEventListener("popstate", sync);
    };
  }, []);

  useEffect(() => {
    entriesRef.current = entries;
  }, [entries]);

  useEffect(() => {
    try { restoreIncludedCatalog(); }
    catch { /* Bundled games stay visible even when preference storage is blocked. */ }
  }, []);

  useEffect(() => {
    let active = true;
    const checking = new Set();
    const inspected = new WeakMap();

    function checkSources(sources) {
      for (const source of sources) {
        if (checking.has(source)) continue;
        checking.add(source);
        // Only imports without a persistent handle rely on their in-memory copy.
        const check = isLocalArchiveSource(source) && !source.handle && sessionGames.has(source.id)
          ? Promise.resolve("session") : checkGameSource(source);
        void check.then(async (status) => {
          let archiveFiles = source.archiveFiles;
          // Recheck legacy imports and changed archives using existing read access.
          // Never delete source records or request permission in the background.
          if (status === "available" && !source.url && source.handle) {
            archiveFiles = await inspectLocalSourceFiles(source, inspected).catch(() => []);
          }
          if (active) {
            setEntries((current) => current.map((entry) =>
              entry.source === source ? { ...entry, status, archiveFiles } : entry
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
        if (active) showNotice("Could not load saved games from this browser.");
      }
      if (!active) return;
      const sourcesById = new Map(saved.map((source) => [source.id, source]));
      for (const [id, source] of sessionSources) sourcesById.set(id, source);
      const sources = [...sourcesById.values()];
      if (sources.length) {
        try {
          const presentation = await loadSourcePresentation();
          if (!active) return;
          setSourcePresentation(presentation);
          if (!presentation.artwork) showNotice("Could not load artwork for saved games.");
        } catch {
          if (active) {
            showNotice("Could not load saved games. Reload to try again.");
            setLoading(false);
          }
          return;
        }
      }
      if (!active) return;
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
    const cards = [...document.querySelectorAll("#library [data-library-source-ids]")]
      .filter((card) => JSON.parse(card.dataset.librarySourceIds).some((id) => addedIds.has(id)));
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

  async function run(action, reportError = showNotice) {
    if (loading || working.current) return;
    working.current = true;
    setBusy(true);
    setNotice(null);
    try {
      return await action();
    } catch (error) {
      if (error?.name !== "AbortError") reportError(error?.message || "Could not update your game library.");
    } finally {
      working.current = false;
      setBusy(false);
    }
  }

  function removeLibraryVersions(item, versions) {
    const removable = removableLibraryVersions({ versions });
    if (!removable.length) return false;
    return run(async () => {
      const ids = new Set(removable.map(({ source }) => source.id));
      const removed = entries.filter(({ source }) => ids.has(source.id));
      if (!removed.length) return false;
      const session = removed.map(({ source }) => ({
        id: source.id, source: sessionSources.get(source.id), data: sessionGames.get(source.id),
      }));
      await removeSources(removed.map(({ source }) => source));
      setRemovals((current) => [...current, {
        title: item.title, entries: removed, session,
      }]);
      return true;
    });
  }

  function undoRemoval() {
    return run(async () => {
      const removal = removals.at(-1);
      if (!removal) return;
      const existingIds = new Set(entries.map(({ source }) => source.id));
      const temporary = new Set(removal.session.filter(({ source }) => source).map(({ id }) => id));
      const saved = removal.entries.filter(({ source }) => !temporary.has(source.id) && !existingIds.has(source.id));
      if (saved.length) await saveGameSources(saved.map(({ source }) => source));
      for (const { id, source, data } of removal.session) {
        if (existingIds.has(id)) continue;
        if (source) sessionSources.set(id, source);
        if (data) sessionGames.set(id, data);
      }
      setEntries((current) => {
        const currentIds = new Set(current.map(({ source }) => source.id));
        return [...current, ...removal.entries.filter(({ source }) => !currentIds.has(source.id))];
      });
      setRemovals((current) => current.slice(0, -1));
      return true;
    });
  }

  function importRoots(selection, replacing) {
    return run(async () => {
      // Capture picker handles in the user gesture before loading processing code.
      const selectionRoots = typeof selection === "function" ? await selection() : selection;
      if (!selectionRoots.length) return;
      const { importLibraryRoots } = await import("./game-import-controller.mjs");
      return importLibraryRoots(selectionRoots, replacing, {
        catalog, entries, sourcePresentation, sessionGames, sessionSources,
        loadSourcePresentation, setSourcePresentation, updateEntries, setPending, setImportResult,
      });
    }, (message) => setImportResult({
      savedIds: new Set(),
      items: [{ label: "Game archive", message, status: "error" }],
    }));
  }

  function confirmImport() {
    if (!importResult.replacing && importResult.savedIds.size) setAddedIds(importResult.savedIds);
    setImportResult(null);
  }

  function chooseArchive(replacing = null) {
    if (typeof window.showOpenFilePicker === "function") {
      importRoots(async () => (await chooseArchiveHandles(!replacing)).map(handleNode), replacing);
    } else {
      replacingSource.current = replacing;
      fileInput.current.multiple = !replacing;
      fileInput.current.click();
    }
  }

  function updateStatus(source, status) {
    setEntries((current) => current.map((entry) =>
      entry.source === source ? { ...entry, status } : entry
    ));
  }

  function play(source, game, resume = false, legacySaves = false) {
    if (!source.url && !isLocalArchiveSource(source)) return chooseArchive(source);
    let navigated = false;
    return run(async () => {
      if (!source.url && source.handle && !sessionGames.has(source.id)
        && await source.handle.queryPermission({ mode: "read" }) !== "granted") {
        updateStatus(source, "permission");
        const group = groups.find(({ versions }) => versions.some((version) => version.source?.id === source.id));
        if (group) selectGame(group.game);
        return;
      }
      game = { ...game, recentGameId: `source:${source.id}`, saveVersionId: legacySaves ? undefined : source.id,
        saveNamespace: legacySaves ? undefined : await getVersionSaveNamespace(source.id), skipIntro: null };
      if (source.url) {
        selectGameArchive(async (signal, onProgress) => {
          const { readRemoteGameArchive } = await import("../game-bucket.mjs");
          return readRemoteGameArchive(source.url, { signal, onProgress });
        }, game);
      } else {
        const data = sessionGames.get(source.id);
        if (!data && !source.handle) {
          updateStatus(source, "locate");
          showNotice("Locate the game ZIP or ISO to play again.");
          return;
        }
        try {
          const file = data ?? await source.handle.getFile();
          validateLocalGameArchive(file);
          selectGameArchive(async (signal, onProgress) => {
            const { openLocalGameArchive } = await import("../local-game-archive.mjs");
            return openLocalGameArchive(file, signal, onProgress);
          }, game);
        } catch (error) {
          const permission = ["NotAllowedError", "SecurityError"].includes(error?.name);
          updateStatus(source, permission ? "permission" : "missing");
          showNotice(permission ? "Allow file access to play this game."
            : "Could not open the game file. Locate the file to reconnect it.");
          return;
        }
      }
      rememberGameVersion(getGameFamilyKey(game) || `source:${source.id}`, `source:${source.id}`);
      if (!onPlayArchive?.(game, resume)) {
        router.push(`${sourcePresentation.getGamePlayHref(game)}${resume ? "#continue" : ""}`);
      }
      navigated = true;
    }).finally(() => { if (!navigated) void exitImmersiveMode(); }).then(() => navigated);
  }

  function allowAccess(source) {
    return run(async () => {
      // Request directly from the click, before any storage work can consume user activation.
      const status = await requestGameSourceAccess(source);
      updateStatus(source, status);
      if (status === "available") {
        const archiveFiles = await inspectLocalSourceFiles(source, new WeakMap()).catch(() => []);
        setEntries((current) => current.map((entry) => entry.source === source ? { ...entry, archiveFiles } : entry));
      }
      showNotice(status === "available" ? "File access allowed. You can now play."
        : status === "permission" ? "File access was not allowed. Try again and allow access in your browser to play."
        : "Could not open the game file. Locate the file to reconnect it.", status === "available" ? "success" : "error");
    });
  }

  const disabled = loading || busy || Boolean(importResult);
  const library = entries.map(({ source, status, archiveFiles }) => {
    const game = sourcePresentation.getSourceGamePresentation(source, catalog, recognizedGames);
    const title = game.displayTitle;
    const locate = !source.url && (!isLocalArchiveSource(source) || ["missing", "locate"].includes(status));
    const locateLabel = "Locate ZIP or ISO";
    const needsAccess = status === "permission";
    return {
      source, status, archiveFiles, game, title, locate, locateLabel,
      action: {
        label: locate ? `${locateLabel} for ${title}` : needsAccess ? `Allow file access for ${title}` : `Play ${title}`,
        buttonLabel: locate ? locateLabel : needsAccess ? "Allow file access" : "Play",
        needsAccess,
        disabled: disabled || status === "checking",
        onClick: () => locate ? chooseArchive(source) : needsAccess ? allowAccess(source) : play(source, game),
        onContinue: () => play(source, game, true),
        onLegacy: () => play(source, game, false, true),
        onLocate: () => chooseArchive(source),
        onRemove: () => run(() => removeSources([source])),
      },
    };
  });
  const catalogGroups = useMemo(() => groupGameVersions(catalogGameEntries(catalog)), [catalog]);
  const groups = library.length ? sourcePresentation.libraryItems(catalog, library) : catalogGroups;
  const featuredGroup = featuredGame && groups.find(({ game }) => getGameFamilyKey(game) === getGameFamilyKey(featuredGame));
  const featuredKey = getGameFamilyKey(featuredGame) || `catalog:${featuredGame?.target}`;
  const heroGroups = featuredGroup || isHomePage ? groups : [...groups, {
    key: featuredKey, game: featuredGame, title: featuredGame.displayTitle,
    versions: [{ key: `catalog:${featuredGame.target}`, game: featuredGame }],
  }];

  function selectGame(game) {
    if (playerRoute) return false;
    const href = buildGameExitHref(game);
    // Only handle selections this mounted library can render. Other links keep
    // normal Next.js navigation, including direct links from compatibility.
    const group = groups.find((group) => buildGameExitHref(group.game) === href);
    if (!group) return false;
    if (`${window.location.pathname}${window.location.search}${window.location.hash}` !== href) {
      window.history.pushState(null, "", href);
    }
    // Next updates usePathname in a transition; select the hero immediately.
    setSelection(group.key);
    setNavigationId((value) => value + 1);
    return true;
  }

  return (
    <ArtworkDelivery value={(hasSources && sourcePresentation?.artwork) || artwork}>
      <GameNavigationContext value={selectGame}>
        {!playerRoute && <BrowseMetadata game={featuredGame} catalog={catalog} isHomePage={isHomePage} />}
        <input ref={fileInput} type="file" accept=".zip,.iso,application/zip,application/x-iso9660-image" multiple hidden
          onChange={(event) => {
            const files = [...event.target.files];
            if (files.length) importRoots(files.map(fileNode), replacingSource.current);
            event.target.value = "";
          }} />
        <GameDropOverlay importRoots={importRoots} disabled={disabled} pending={pending}
          result={importResult} onConfirm={confirmImport} />
        {featuredGame && heroGroups.length > 0 && <HomeHero groups={heroGroups} featuredGame={featuredGame}
          loadingSources={loading}
          pendingSourceGroups={library.filter(({ status }) => status === "checking")
            .map(({ game, source }) => getGameFamilyKey(game) || `source:${source.id}`)}
          isHomePage={isHomePage} selection={selection} navigationId={navigationId} notice={notice} />}
        <div className={`section-stack${!heroGroups.length ? " library-without-hero" : ""}`}>
          <RecentGamesRail groups={groups} />
          <LibraryView items={groups} heading={libraryHeading} notice={notice}
            onRemove={removeLibraryVersions} onUndo={undoRemoval} removal={removals.at(-1)}
            onAddGame={() => chooseArchive()} importDisabled={disabled} selectedKey={selection || (!isHomePage ? featuredKey : null)} />
        </div>
      </GameNavigationContext>
    </ArtworkDelivery>
  );
}
