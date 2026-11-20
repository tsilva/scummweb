"use client";

import { sourceActivityVersion } from "../game-player/activity.mjs";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { exitImmersiveMode } from "../game-player/immersive-mode.mjs";
import { checkGameSource, isLocalArchiveSource, readGameSources, removeGameSources, requestGameSourceAccess, saveGameSources } from "../game-sources.mjs";
import { selectGameArchive, validateLocalGameArchive } from "../local-game-selection.mjs";
import { fileNode, handleNode } from "../game-import-nodes.mjs";
import { inspectLocalSourceFiles } from "../game-source-inspection.mjs";
import { startArchiveRecovery } from "./archive-recovery.mjs";
import LibraryView from "./library-view";
import { catalogGameEntries, getGameFamilyKey, getVersionSaveNamespace, groupGameVersions, rememberGameVersion } from "../game-versions.mjs";
import { buildGameExitHref, readHeroSelection } from "./hero-selection.mjs";
import { withDropboxPreview } from "../dropbox/feature.mjs";
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
const locateStatuses = new Set(["missing", "locate", "unverified"]);

function hasSavedArchive(source) {
  return !source.url && source.handle && isLocalArchiveSource(source);
}

function shouldRetryLocalSource({ source, status }) {
  return hasSavedArchive(source) && locateStatuses.has(status);
}

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
  const pickOnNextLocate = useRef(new WeakSet());
  const entriesRef = useRef([]);
  const sourceChecks = useRef(null);
  const archiveRecovery = useRef(null);
  const [removals, setRemovals] = useState([]);
  const shouldRetryLocalSources = entries.some(shouldRetryLocalSource);

  function showNotice(message, tone = "error", source = null) {
    setNotice({ message, tone, source });
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
    const checks = new WeakMap();
    const inspected = new WeakMap();

    function checkSource(source, force = false) {
      if (!force && checks.has(source)) return checks.get(source).complete;
      const check = {};
      checks.set(source, check);
      let checkedFile;
      const readiness = (async () => {
        // Only imports without a persistent handle rely on their in-memory copy.
        const status = isLocalArchiveSource(source) && !source.handle && sessionGames.has(source.id)
          ? "session" : await checkGameSource(source, { onFile: (file) => { checkedFile = file; } });
        if (!active || checks.get(source) !== check) return;
        setEntries((current) => {
          const entry = current.find((entry) => entry.source === source);
          if (!entry || entry.status === status) return current;
          return current.map((item) => item === entry ? { ...item, status } : item);
        });
        if (status === "available" || status === "permission") pickOnNextLocate.current.delete(source);
        if (status === "available") setNotice((current) => current?.source === source ? null : current);
        return status;
      })();
      check.complete = readiness.then(async (status) => {
        if (status !== "available" || !checkedFile) return status;
        // Keep edition matching up to date without delaying the availability result.
        const archiveFiles = await inspectLocalSourceFiles(source, inspected, checkedFile).catch(() => []);
        if (!active || checks.get(source) !== check) return;
        setEntries((current) => current.map((entry) => entry.source === source
          && entry.archiveFiles !== archiveFiles ? { ...entry, archiveFiles } : entry));
        return status;
      }).finally(() => {
        if (checks.get(source) === check) checks.delete(source);
      });
      // The foreground Locate action can restore its button before inspection finishes.
      return force ? readiness : check.complete;
    }

    function recheck() {
      if (!document.hidden && !working.current) {
        for (const entry of entriesRef.current) {
          if (!shouldRetryLocalSource(entry)) void checkSource(entry.source);
        }
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

      for (const source of sources) void checkSource(source);
    }
    sourceChecks.current = { checkSource, invalidate: (source) => checks.delete(source) };
    window.addEventListener("focus", recheck);
    window.addEventListener("pageshow", onPageShow);
    document.addEventListener("visibilitychange", recheck);
    void restore();
    return () => {
      active = false;
      sourceChecks.current = null;
      window.removeEventListener("focus", recheck);
      window.removeEventListener("pageshow", onPageShow);
      document.removeEventListener("visibilitychange", recheck);
    };
  }, [catalog, officialUrl]);

  useEffect(() => {
    if (!shouldRetryLocalSources) return;
    const recovery = startArchiveRecovery({
      document,
      getSources: () => entriesRef.current.filter(shouldRetryLocalSource).map(({ source }) => source),
      checkSource: (source) => sourceChecks.current?.checkSource(source),
      isBusy: () => working.current,
    });
    archiveRecovery.current = recovery;
    return () => {
      archiveRecovery.current = null;
      recovery.stop();
    };
  }, [shouldRetryLocalSources]);

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

  async function locateArchive(source) {
    if (!hasSavedArchive(source) || pickOnNextLocate.current.delete(source)) return chooseArchive(source);
    const status = await run(() => sourceChecks.current?.checkSource(source, true));
    if (status === "available") archiveRecovery.current?.archiveAvailable(source);
    if (!locateStatuses.has(status)) return;
    // A slow disk can outlast the browser's activation window for opening a picker.
    if (navigator.userActivation?.isActive === false) {
      pickOnNextLocate.current.add(source);
      showNotice("The saved file is still unavailable. Choose Locate ZIP or ISO again to pick the file.", "error", source);
      return;
    }
    return chooseArchive(source);
  }

  function updateStatus(source, status) {
    sourceChecks.current?.invalidate(source);
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
      game = { ...game, recentGameId: `source:${source.id}`, activityVersion: sourceActivityVersion(source),
        saveFingerprint: source.fingerprint,
        saveVersionId: legacySaves ? undefined : source.id,
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
          showNotice("Locate the game ZIP or ISO to play again.", "error", source);
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
            : "Could not open the game file. Locate the file to reconnect it.", "error", source);
          return;
        }
      }
      rememberGameVersion(getGameFamilyKey(game) || `source:${source.id}`, `source:${source.id}`);
      if (!onPlayArchive?.(game, resume)) {
        router.push(withDropboxPreview(`${sourcePresentation.getGamePlayHref(game)}${resume ? "#continue" : ""}`, window.location.href));
      }
      navigated = true;
    }).finally(() => { if (!navigated) void exitImmersiveMode(); }).then(() => navigated);
  }

  async function allowAccess(source) {
    const updated = await run(async () => {
      // Request directly from the click, before any storage work can consume user activation.
      const status = await requestGameSourceAccess(source);
      updateStatus(source, status);
      if (status === "available") {
        const archiveFiles = await inspectLocalSourceFiles(source, new WeakMap()).catch(() => []);
        setEntries((current) => current.map((entry) => entry.source === source ? { ...entry, archiveFiles } : entry));
      }
      showNotice(status === "available" ? "File access allowed. You can now play."
        : status === "permission" ? "File access was not allowed. Try again and allow access in your browser to play."
        : "Could not open the game file. Locate the file to reconnect it.",
      status === "available" ? "success" : "error", status === "available" ? null : source);
      return status;
    });
    if (updated === "available") archiveRecovery.current?.archiveAvailable(source);
  }

  const disabled = loading || busy || Boolean(importResult);
  const library = entries.map(({ source, status, archiveFiles }) => {
    const game = sourcePresentation.getSourceGamePresentation(source, catalog, recognizedGames);
    const title = game.displayTitle;
    const locate = !source.url && (!isLocalArchiveSource(source) || locateStatuses.has(status));
    const locateLabel = "Locate ZIP or ISO";
    const needsAccess = status === "permission";
    return {
      source, status, archiveFiles, game, title, locate, locateLabel,
      action: {
        label: locate ? `${locateLabel} for ${title}` : needsAccess ? `Allow file access for ${title}` : `Play ${title}`,
        buttonLabel: locate ? locateLabel : needsAccess ? "Allow file access" : "Play",
        needsAccess,
        disabled: disabled || status === "checking",
        onClick: () => locate ? locateArchive(source) : needsAccess ? allowAccess(source) : play(source, game),
        onContinue: () => play(source, game, true),
        onLegacy: () => play(source, game, false, true),
        onLocate: () => locateArchive(source),
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
    const path = buildGameExitHref(game);
    // Only handle selections this mounted library can render. Other links keep
    // normal Next.js navigation, including direct links from compatibility.
    const group = groups.find((group) => buildGameExitHref(group.game) === path);
    if (!group) return false;
    const href = withDropboxPreview(path, window.location.href);
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
