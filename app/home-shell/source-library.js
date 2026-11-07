"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { exitImmersiveMode } from "../game-player/immersive-mode.mjs";
import { readRemoteGameArchive } from "../game-bucket.mjs";
import { getGamePlayHref, getSourceGamePresentation } from "../game-play-source.mjs";
import { checkGameSource, isLocalZipSource, localGame, readGameSources, removeGameSources, requestGameSourceAccess, saveGameSources } from "../game-sources.mjs";
import { findLocalGameSource } from "../local-game-matching.mjs";
import { findBundledGame } from "../bundled-game-matching.mjs";
import { maxLocalGameSize, openLocalGameZip, selectGameArchive, validateGameZip } from "../local-game-archive.mjs";
import { collectGameImportNodes, fileNode, handleNode, inspectLocalSourceFiles, prepareLocalZip } from "../local-game-import.mjs";
import LibraryView from "./library-view";
import { libraryItems } from "./library-query.mjs";
import { getGameFamilyKey, getVersionSaveNamespace, rememberGameVersion } from "../game-versions.mjs";
import { getRecognizedGames } from "../recognized-games.mjs";
import { buildGameExitHref, readHeroSelection } from "./hero-selection.mjs";
import HomeHero from "./home-hero";
import GameDropOverlay, { chooseZipHandles } from "./local-game";
import RecentGamesRail from "../recent-games-rail";
import { GameNavigationContext } from "./game-navigation";
import BrowseMetadata from "./browse-metadata";

const sessionGames = new Map();
const sessionSources = new Map();
const reducedMotionQuery = "(prefers-reduced-motion: reduce)";

function scrollToLibraryItem(item, block) {
  const behavior = window.matchMedia(reducedMotionQuery).matches ? "instant" : "smooth";
  item?.scrollIntoView({ behavior, block });
}

const reconnectStatuses = new Set(["locate", "missing", "permission"]);

export default function SourceLibrary({ catalog, featuredGame: initialFeaturedGame, isHomePage: initiallyHome = true, libraryHeading, officialUrl, onPlayArchive, playerRoute = false }) {
  const router = useRouter();
  const pathname = usePathname();
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState(null);
  const recognizedGames = useMemo(() => getRecognizedGames(catalog), [catalog]);
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
    let active = true;
    const checking = new Set();
    const inspected = new WeakMap();

    function checkSources(sources) {
      for (const source of sources) {
        if (checking.has(source)) continue;
        checking.add(source);
        // Only imports without a persistent handle rely on their in-memory copy.
        const check = isLocalZipSource(source) && !source.handle && sessionGames.has(source.id)
          ? Promise.resolve("session") : checkGameSource(source);
        void check.then(async (status) => {
          let archiveFiles = source.archiveFiles;
          // Recheck legacy imports and changed ZIPs using existing read access.
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
    // A ZIP can replace a legacy folder while retaining its source ID and saves.
    delete source.kind;
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
      const selectionRoots = typeof selection === "function" ? await selection() : selection;
      if (!selectionRoots.length) return;
      setPending([{ index: 0, label: "Finding game ZIPs…", message: "Checking dropped files and folders…" }]);
      const roots = await collectGameImportNodes(selectionRoots);
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
        const included = findBundledGame(game, catalog);
        if (included && !reconnect) {
          const item = { label, status: "skipped", message: "Already included. Using the bundled copy." };
          items.push(item);
          return item;
        }
        const result = await saveLocal(game, known, reconnect);
        const firstSave = !savedIds.has(result.id);
        savedIds.add(result.id);
        reconnectable.delete(result.id);
        const item = {
          label,
          status: reconnect ? "skipped" : "added",
          message: included ? "Already included. Using the bundled copy. Existing saves are preserved."
            : reconnect ? "Already in your library. Files refreshed." : "Added to your library",
        };
        items.push(item);
        if (firstSave && result.temporary) temporary++;
        return item;
      }

      setPending(roots.map((root, index) => ({ index, label: root.name ?? "Game ZIP", message: "Waiting to scan…" })));
      try {
        for (const [index, root] of roots.entries()) {
          let label = "Dropped item";
          try {
            const node = await root;
            if (!node) throw new Error("Could not read this item. Try dropping it again.");
            label = node.name;
            updateProgress(index, { label, message: "Checking ZIP…", value: index, total: roots.length });
            const item = await save(await prepareLocalZip(node));
            updateProgress(index, item);
          } catch (error) {
            const item = { label, message: error.message, status: "error" };
            items.push(item);
            updateProgress(index, item);
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
      items: [{ label: "Game ZIP", message, status: "error" }],
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

  function updateStatus(source, status) {
    setEntries((current) => current.map((entry) =>
      entry.source === source ? { ...entry, status } : entry
    ));
  }

  function play(source, game, resume = false, legacySaves = false) {
    if (!source.url && !isLocalZipSource(source)) return chooseZip(source);
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
        selectGameArchive((signal, onProgress) => readRemoteGameArchive(source.url, { signal, onProgress }), game);
      } else {
        const data = sessionGames.get(source.id);
        if (!data && !source.handle) {
          updateStatus(source, "locate");
          showNotice("Locate the game ZIP to play again.");
          return;
        }
        try {
          const file = data ?? await source.handle.getFile();
          validateGameZip(file, maxLocalGameSize);
          selectGameArchive((signal, onProgress) => openLocalGameZip(file, signal, onProgress), game);
        } catch (error) {
          const permission = ["NotAllowedError", "SecurityError"].includes(error?.name);
          updateStatus(source, permission ? "permission" : "missing");
          showNotice(permission ? "Allow file access to play this game."
            : "Could not open the ZIP. Locate the file to reconnect it.");
          return;
        }
      }
      rememberGameVersion(getGameFamilyKey(game) || `source:${source.id}`, `source:${source.id}`);
      if (!onPlayArchive?.(game, resume)) {
        router.push(`${getGamePlayHref(game)}${resume ? "#continue" : ""}`);
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
        : "Could not open the ZIP. Locate the file to reconnect it.", status === "available" ? "success" : "error");
    });
  }

  const disabled = loading || busy || Boolean(importResult);
  const library = entries.map(({ source, status, archiveFiles }) => {
    const game = getSourceGamePresentation(source, catalog, recognizedGames);
    const title = game.displayTitle;
    const locate = !source.url && (!isLocalZipSource(source) || ["missing", "locate"].includes(status));
    const locateLabel = "Locate ZIP";
    const needsAccess = status === "permission";
    return {
      source, status, archiveFiles, game, title, locate, locateLabel,
      action: {
        label: locate ? `${locateLabel} for ${title}` : needsAccess ? `Allow file access for ${title}` : `Play ${title}`,
        buttonLabel: locate ? locateLabel : needsAccess ? "Allow file access" : "Play",
        needsAccess,
        disabled: disabled || status === "checking",
        onClick: () => locate ? chooseZip(source) : needsAccess ? allowAccess(source) : play(source, game),
        onContinue: () => play(source, game, true),
        onLegacy: () => play(source, game, false, true),
        onLocate: () => chooseZip(source),
        onRemove: () => run(() => removeSources([source])),
      },
    };
  });
  const groups = libraryItems(catalog, library);
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
    if (!groups.some((group) => buildGameExitHref(group.game) === href)) return false;
    if (`${window.location.pathname}${window.location.search}${window.location.hash}` !== href) {
      window.history.pushState(null, "", href);
    }
    setSelection(readHeroSelection(new URL(href, window.location.origin).hash));
    setNavigationId((value) => value + 1);
    return true;
  }

  return (
    <GameNavigationContext value={selectGame}>
      {!playerRoute && <BrowseMetadata game={featuredGame} catalog={catalog} isHomePage={isHomePage} />}
      <input ref={fileInput} type="file" accept=".zip,application/zip" multiple hidden
        onChange={(event) => {
          const files = [...event.target.files];
          if (files.length) importRoots(files.map(fileNode), replacingSource.current);
          event.target.value = "";
        }} />
      <GameDropOverlay importRoots={importRoots} disabled={disabled} pending={pending}
        result={importResult} onConfirm={confirmImport} />
      {featuredGame && <HomeHero groups={heroGroups} featuredGame={featuredGame}
        loadingSources={loading}
        pendingSourceGroups={library.filter(({ status }) => status === "checking")
          .map(({ game, source }) => getGameFamilyKey(game) || `source:${source.id}`)}
        isHomePage={isHomePage} selection={selection} navigationId={navigationId} notice={notice} />}
      <div className="section-stack">
        <RecentGamesRail groups={groups} />
        <LibraryView items={groups} heading={libraryHeading} notice={notice}
          onAddGame={() => chooseZip()} importDisabled={disabled} selectedKey={selection || (!isHomePage ? featuredKey : null)} />
      </div>
    </GameNavigationContext>
  );
}
