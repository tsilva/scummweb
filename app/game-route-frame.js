"use client";

import { captureMessage, withScope } from "@sentry/nextjs";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { buildSkipIntroLaunchSrc } from "./skip-intro-config.mjs";
import { readCatalogGameArchive } from "./game-bucket.mjs";
import { gameLoadingStatus } from "./game-loading-status.mjs";
import { isTvBrowser } from "./controller-device.mjs";
import GameBootOverlay from "./game-player/GameBootOverlay";
import GamePlayerControls from "./game-player/GamePlayerControls";
import GameTouchCursorPad from "./game-player/GameTouchCursorPad";
import { createGameLaunchAnalytics } from "./game-player/game-launch-analytics.mjs";
import { observeStartupDiagnostics } from "./game-player/startup-diagnostics.mjs";
import { withGameTelemetry } from "./game-player/telemetry.mjs";
import { dispatchGameCommand, dispatchSyntheticKeypressSequence } from "./game-player/keyboard";
import { getGameMenuShortcut } from "./game-player/game-menu.mjs";
import { observeRemoteMouse } from "./game-player/game-mouse.mjs";
import { useBootState } from "./game-player/useBootState";
import { useImmersiveMode } from "./game-player/useImmersiveMode";
import { useTouchClickActions } from "./game-player/useTouchClickMode";
import { useTouchCursorPad } from "./game-player/useTouchCursorPad";
import { sendZipGameFiles } from "./home-shell/zip-game-player";
import { recordRecentGameTarget } from "./recent-games";
import "./styles/game-controls.css";

const SCUMMWEB_FRAME_MESSAGE_SOURCE = "scummweb";
const SCUMMWEB_ASPECT_RATIO_MESSAGE_TYPE = "scummweb-aspect-ratio";
const ARCHIVE_FRAME_NAVIGATION_TIMEOUT_MS = 8000;
const ARCHIVE_BOOT_IDLE_TIMEOUT_MS = 120_000;
const BOOT_ERROR_MESSAGES = new Map([
  ["script-load", "Could not load a player script"],
  ["script-error", "Player JavaScript error"],
  ["promise-rejection", "Unhandled player promise rejection"],
  ["filesystem", "Could not prepare the game filesystem"],
  ["runtime-abort", "ScummVM runtime aborted"],
  ["game-detection", "ScummVM could not identify the game data"],
  ["webgl-context-lost", "Player WebGL context lost"],
  ["runtime-exit", "ScummVM exited with an error"],
  ["startup-timeout", "ScummVM took too long to start"],
]);
const MIB = 1024 * 1024;
const catalogArchiveLimits = {
  "dreamweb-cd": { archiveLimit: 300 * MIB, expandedLimit: 300 * MIB, timeoutMs: 600_000 },
  queen: { timeoutMs: 600_000 },
  sword25: { archiveLimit: 900 * MIB, expandedLimit: 900 * MIB, timeoutMs: 900_000 },
};

function getSafeHref(href) {
  if (!href) {
    return "/";
  }

  try {
    const resolvedUrl = new URL(href, window.location.href);

    if (resolvedUrl.origin !== window.location.origin) {
      return "/";
    }

    return `${resolvedUrl.pathname}${resolvedUrl.search}${resolvedUrl.hash}`;
  } catch {
    return "/";
  }
}

function getExitHrefFromSrc(src) {
  if (typeof window === "undefined") {
    return "/";
  }

  try {
    const resolvedUrl = new URL(src, window.location.href);
    return getSafeHref(resolvedUrl.searchParams.get("exitTo") || "/");
  } catch {
    return "/";
  }
}

function getNormalizedFrameHref(href) {
  if (typeof window === "undefined" || !href) {
    return null;
  }

  try {
    const resolvedUrl = new URL(href, window.location.href);
    return `${resolvedUrl.pathname}${resolvedUrl.search}${resolvedUrl.hash}`;
  } catch {
    return null;
  }
}

function getCatalogBootErrorDetail(message) {
  if (typeof message !== "string") return undefined;
  return message.slice(0, 512)
    .replace(/\b(?:[a-z][a-z\d+.-]*:\/\/|data:|blob:)[^\s"'<>]+/gi, "[url]")
    .replace(/(?:[a-z]:\\|\/)[^\s"'<>]+/gi, "[path]")
    .trim() || undefined;
}

function buildSaveSlotSrc(src, target, slot, { seedIntro = false } = {}) {
  const resolvedUrl = new URL(src, window.location.href);
  if (seedIntro) {
    resolvedUrl.searchParams.set("skipIntroTarget", target);
  }
  resolvedUrl.hash = ["-x", String(slot), target].join(" ");
  return `${resolvedUrl.pathname}${resolvedUrl.search}${resolvedUrl.hash}`;
}

function focusGameCanvas(frame) {
  if (!frame) {
    return false;
  }

  try {
    frame.focus({ preventScroll: true });
  } catch {}

  try {
    frame.contentWindow?.focus();
  } catch {}

  try {
    const canvas = frame.contentDocument?.getElementById("canvas");

    if (!(canvas instanceof HTMLElement)) {
      return false;
    }

    canvas.focus({ preventScroll: true });
    return frame.contentDocument?.activeElement === canvas;
  } catch {
    return false;
  }
}

export default function GameRouteFrame({
  game = null,
  src,
  target,
  title,
  skipIntro: intro = null,
  loadArchive: loadPersonalArchive,
  catalogArchiveUrl,
  archiveLoadingText = "Loading game…",
}) {
  const loadCatalogArchive = useCallback((signal, onProgress) => readCatalogGameArchive(catalogArchiveUrl, {
    ...catalogArchiveLimits[target], signal, onProgress,
  }), [catalogArchiveUrl, target]);
  const loadArchive = catalogArchiveUrl ? loadCatalogArchive : loadPersonalArchive;
  const catalogLaunch = !loadArchive || Boolean(catalogArchiveUrl);
  const router = useRouter();
  const shellRef = useRef(null);
  const frameRef = useRef(null);
  const frameBootRef = useRef(null);
  const archiveFiles = useRef(null);
  const archiveReceiver = useRef(null);
  const [archivePrepared, setArchivePrepared] = useState(false);
  const [archiveError, setArchiveError] = useState("");
  const [archiveProgress, setArchiveProgress] = useState(null);
  const [archiveCached, setArchiveCached] = useState(false);
  const [launchAnalytics] = useState(() => createGameLaunchAnalytics(catalogLaunch ? game?.slug : null));
  const [frameSrc, setFrameSrc] = useState(null);
  const [archiveFrameDocument, setArchiveFrameDocument] = useState(null);
  const [isResuming, setIsResuming] = useState(false);
  const [exitHref, setExitHref] = useState("/");
  const [readySignal, setReadySignal] = useState(null);
  const [skipIntroConsumed, setSkipIntroConsumed] = useState(false);
  const [catalogIntroLaunch, setCatalogIntroLaunch] = useState(null);
  const skipIntro = isResuming ? null : intro;
  const bootState = useBootState({
    displayTitle: game?.displayTitle || title,
    frameRef,
    frameSrc,
    readySignal,
    skipIntro,
    skipIntroConsumed,
  });
  const immersiveMode = useImmersiveMode({ shellRef });
  const navigateHome = useCallback(async (href) => {
    await immersiveMode.exitImmersiveMode?.({ silenceErrors: true });
    const destination = getSafeHref(href);
    if (catalogLaunch) window.location.replace(destination);
    else router.replace(destination);
  }, [catalogLaunch, router, immersiveMode.exitImmersiveMode]);
  const touchClick = useTouchClickActions({
    frameRef,
    skipIntro,
    skipIntroConsumed,
  });
  const hasBootFailed = Boolean(archiveError) || bootState.hasBootFailed;
  const showBootOverlay = !bootState.hasBootCompleted || hasBootFailed;
  const mobileControlsReady =
    immersiveMode.isMobileViewport && bootState.hasBootCompleted && !hasBootFailed;
  const usesCommandInput = game?.engineId === "adl";
  const showCommandInput = mobileControlsReady && usesCommandInput;
  const showTouchMouse = mobileControlsReady && !usesCommandInput;
  const touchCursorPad = useTouchCursorPad({
    enabled: showTouchMouse,
    frameRef,
  });

  useEffect(() => observeStartupDiagnostics(window, frameRef), []);

  useLayoutEffect(() => {
    const navigationController = new AbortController();
    if (frameBootRef.current?.src !== frameSrc) {
      frameBootRef.current = { src: frameSrc, reported: false, ready: false };
    }
    const frameBoot = frameBootRef.current;

    function reportBootError(stage, { name, message, status } = {}) {
      const description = BOOT_ERROR_MESSAGES.get(stage);
      if (!frameSrc || !description || frameBoot.ready || frameBoot.reported) return;
      frameBoot.reported = true;
      withScope((scope) => {
        if (!catalogLaunch) {
          // The page URL or navigation breadcrumbs can contain a private ZIP link.
          scope.addEventProcessor(({ request, breadcrumbs, transaction, contexts, ...event }) => {
            const { trace, ...safeContexts } = contexts ?? {};
            return { ...event, contexts: safeContexts };
          });
        }
        captureMessage(`ScummVM startup failed: ${description}`, {
          level: "error",
          tags: {
            component: "scummvm-player",
            startup_stage: stage,
            game_source: catalogLaunch ? "catalog" : "local",
            game_slug: catalogLaunch ? game?.slug : undefined,
          },
          contexts: {
            scummvm: {
              engine: catalogLaunch ? game?.engineId : undefined,
              error_name: typeof name === "string" && /^(?:[A-Za-z0-9]{0,40}Error|ExitStatus)$/.test(name) ? name : undefined,
              detail: catalogLaunch ? getCatalogBootErrorDetail(message) : undefined,
              exit_status: Number.isInteger(status) ? status : undefined,
            },
          },
        });
      });
    }

    const navigationTimer = loadArchive && frameSrc && !archiveFrameDocument ? window.setTimeout(async () => {
      const iframe = frameRef.current;
      function needsRetry() {
        const documentUrl = iframe?.contentDocument?.URL;
        return !navigationController.signal.aborted && iframe &&
          (!documentUrl || documentUrl === "about:blank");
      }
      if (!needsRetry()) return;

      // The network response can arrive without the browser committing the frame
      // navigation. Load the same-origin shell into the replacement frame directly.
      const retryUrl = new URL(frameSrc, window.location.href);
      retryUrl.searchParams.set("launchRetry", "inline");
      try {
        const response = await fetch(retryUrl, { mode: "same-origin", signal: navigationController.signal });
        if (!response.ok) throw new Error("Could not load ScummVM.");
        const shell = await response.text();
        if (!shell.includes("<head>")) throw new Error("Invalid ScummVM shell.");
        if (!needsRetry()) return;
        const baseHref = retryUrl.href.replaceAll("&", "&amp;").replaceAll('"', "&quot;");
        setArchiveFrameDocument(shell.replace("<head>", `<head><base href="${baseHref}">`));
        setFrameSrc(`${retryUrl.pathname}${retryUrl.search}${retryUrl.hash}`);
      } catch {
        if (needsRetry()) setArchiveError("Could not load ScummVM. Exit the player and try again.");
      }
    }, ARCHIVE_FRAME_NAVIGATION_TIMEOUT_MS) : null;

    const archiveFrame = loadArchive && frameSrc ? frameRef.current : null;
    let archiveBootTimer;

    function restartArchiveBootTimer() {
      window.clearTimeout(archiveBootTimer);
      archiveBootTimer = window.setTimeout(() => {
        archiveFiles.current = null;
        reportBootError("startup-timeout");
        setArchiveError("ScummVM took too long to start. Exit the player and try again.");
      }, ARCHIVE_BOOT_IDLE_TIMEOUT_MS);
    }

    function stopArchiveBootTimer() {
      window.clearTimeout(archiveBootTimer);
      archiveFrame?.removeEventListener("load", restartArchiveBootTimer);
    }

    if (archiveFrame && archivePrepared) {
      restartArchiveBootTimer();
      archiveFrame.addEventListener("load", restartArchiveBootTimer, { once: true });
    }

    function deliverArchiveFiles() {
      const receiver = archiveReceiver.current;
      if (!archiveFiles.current || !receiver || receiver !== frameRef.current?.contentWindow) return;
      try {
        sendZipGameFiles(receiver, archiveFiles.current, { saveNamespace: game?.saveNamespace });
        window.performance?.mark?.("scummweb:archive-transferred");
        archiveFiles.current = null;
        restartArchiveBootTimer();
      } catch {
        archiveFiles.current = null;
        stopArchiveBootTimer();
        setArchiveError("Could not prepare this version. Exit the player and try again.");
      }
    }

    function handleMessage(event) {
      if (event.origin !== window.location.origin) {
        return;
      }
      if (event.data?.type === "scummvm-boot-error") {
        if (event.source && event.source === frameRef.current?.contentWindow &&
            typeof event.data.href === "string" && getNormalizedFrameHref(event.data.href) === frameSrc) {
          reportBootError(event.data.stage, event.data);
        }
        return;
      }
      if (event.data?.type === "scummweb:saves-listed" && event.source === frameRef.current?.contentWindow) {
        if (new URL(frameSrc, window.location.href).searchParams.get("continue") === "1") {
          setIsResuming(Number.isInteger(event.data.latestSlot));
        }
        window.dispatchEvent(new Event("scummweb:saves-changed"));
        return;
      }

      if (event.data?.type === "scummweb:save-session-busy" && event.source === frameRef.current?.contentWindow) {
        stopArchiveBootTimer();
        setArchiveError("Another game or save operation is active. Close it in the other tab, then try again.");
        return;
      }

      if (loadArchive && event.source === frameRef.current?.contentWindow) {
        if (event.data?.type === "scummweb:local-game-ready") {
          window.performance?.mark?.("scummweb:runtime-ready-for-files");
          archiveReceiver.current = event.source;
          deliverArchiveFiles();
          return;
        }

        if (event.data?.type === "scummweb:local-game-status") {
          stopArchiveBootTimer();
          if (event.data.status === "running") {
            frameBoot.ready = true;
            if (!catalogLaunch) setReadySignal({ reason: "archive-running" });
          } else {
            if (event.data.status === "undetected") reportBootError("game-detection");
            archiveFiles.current = null;
            setArchiveError((current) => current || (event.data.status === "undetected"
              ? "ScummVM could not detect a supported game. Check that you selected the game files."
              : "ScummVM could not start this game. Check that all the game files are present."));
          }
          return;
        }
      }

      if (event.data?.type === "scummvm-ready") {
        const iframeWindow = frameRef.current?.contentWindow;
        const expectedFrameHref = getNormalizedFrameHref(loadArchive ? frameSrc : frameRef.current?.src || frameSrc);
        const messageFrameHref = getNormalizedFrameHref(event.data?.href);

        if (
          event.data?.source !== SCUMMWEB_FRAME_MESSAGE_SOURCE ||
          event.data?.target !== target ||
          !iframeWindow ||
          event.source !== iframeWindow ||
          !expectedFrameHref ||
          !messageFrameHref ||
          messageFrameHref !== expectedFrameHref
        ) {
          return;
        }

        frameBoot.ready = true;
        setReadySignal({
          href: messageFrameHref,
          reason: event.data?.reason || null,
          reportedAt: event.data?.emittedAt || null,
        });

        if (event.data.reason === "rendered-frame-detected") {
          window.performance?.mark?.("scummweb:game-ready");
          launchAnalytics.confirm();
        } else if (event.data.reason === "rendered-frame-timeout") {
          launchAnalytics.fail("first_frame_timeout");
        }
        return;
      }

      if (event.data?.type !== "scummvm-exit" || event.source !== frameRef.current?.contentWindow) {
        return;
      }

      if (
        event.source === frameRef.current?.contentWindow &&
        Number.isFinite(event.data.status) && event.data.status !== 0
      ) {
        reportBootError("runtime-exit", { status: event.data.status });
        launchAnalytics.fail("startup_error");
      }
      navigateHome(event.data.href || "/");
    }

    window.addEventListener("message", handleMessage);
    deliverArchiveFiles();

    if (!archiveFrameDocument && archiveFrame?.contentWindow &&
        (!archiveFrame.contentDocument || archiveFrame.contentDocument.URL === "about:blank")) {
      // Start navigation after the frame and ZIP handoff listener are both ready.
      archiveFrame.contentWindow.location.replace(new URL(frameSrc, window.location.href).href);
    }

    return () => {
      navigationController.abort();
      window.clearTimeout(navigationTimer);
      stopArchiveBootTimer();
      window.removeEventListener("message", handleMessage);
    };
  }, [archiveFrameDocument, archivePrepared, catalogLaunch, frameSrc, game?.engineId, game?.saveNamespace, game?.slug, launchAnalytics, loadArchive, navigateHome, target]);

  useEffect(() => {
    const controller = new AbortController();
    setReadySignal(null);
    setArchiveProgress(null);
    setArchiveCached(false);
    setArchivePrepared(false);
    archiveFiles.current = null;
    archiveReceiver.current = null;
    setSkipIntroConsumed(catalogIntroLaunch !== null);

    async function openGame() {
      try {
        let launchSrc = src;
        if (window.location.hash === "#continue") {
          const resumeUrl = new URL(launchSrc, window.location.origin);
          resumeUrl.searchParams.set("continue", "1");
          launchSrc = `${resumeUrl.pathname}${resumeUrl.search}${resumeUrl.hash}`;
          setIsResuming(true);
        }
        if (catalogLaunch) {
          launchAnalytics.start();
          const launchHash = window.location.hash;
          const requested = /^#(seed|slot)=(\d{1,9})$/.exec(launchHash);
          const requestedSlot = requested ? Number(requested[2]) : null;
          const introLaunch = catalogIntroLaunch || (launchHash === "#skip-intro" ? intro : null);
          if (introLaunch) setSkipIntroConsumed(true);
          const seeded = introLaunch?.strategy === "save-slot" || (requested?.[1] === "seed" && requestedSlot === intro?.slot);
          const explicitSlot = requested?.[1] === "slot" || seeded ? requestedSlot : null;
          const slot = introLaunch?.strategy === "save-slot" ? introLaunch.slot : explicitSlot;
          if (controller.signal.aborted) return;
          setIsResuming(launchHash === "#continue" || (!introLaunch && slot !== null));
          if (introLaunch?.strategy === "boot-param") {
            launchSrc = buildSkipIntroLaunchSrc(src, target, introLaunch, window.location.href);
          } else if (slot !== null) {
            launchSrc = buildSaveSlotSrc(src, target, slot, { seedIntro: seeded });
          }
          const exitTo = new URLSearchParams(window.location.search).get("exitTo");
          if (exitTo) {
            const shellUrl = new URL(launchSrc, window.location.origin);
            shellUrl.searchParams.set("exitTo", getSafeHref(exitTo));
            launchSrc = `${shellUrl.pathname}${shellUrl.search}${shellUrl.hash}`;
          }
        }
        launchSrc = withGameTelemetry(launchSrc, window.location.href);
        if (loadArchive) {
          // Load/compile ScummVM while the archive downloads or opens. The
          // handoff below supports either side becoming ready first.
          window.performance?.mark?.("scummweb:runtime-requested");
          setFrameSrc(launchSrc);
          const files = await loadArchive(controller.signal, (_progress, { cached = false, loaded, total } = {}) => {
            if (!controller.signal.aborted) {
              setArchiveProgress(Number.isFinite(loaded) ? { loaded, total } : null);
              setArchiveCached(cached);
            }
          });
          if (controller.signal.aborted) return;
          archiveFiles.current = files;
          window.performance?.mark?.("scummweb:archive-prepared");
          setArchivePrepared(true);
        }
        if (!loadArchive) setFrameSrc(launchSrc);
      } catch (error) {
        if (controller.signal.aborted) return;
        launchAnalytics.fail("startup_error");
        setArchiveError(error.message);
      }
    }

    void openGame();
    return () => { controller.abort(); };
  }, [catalogIntroLaunch, catalogLaunch, game, intro, launchAnalytics, loadArchive, src, target]);

  useEffect(() => {
    if (bootState.hasBootFailed) launchAnalytics.fail("startup_error");
  }, [bootState.hasBootFailed, launchAnalytics]);

  const canCountPlayTime =
    readySignal?.reason === "rendered-frame-detected" && !showBootOverlay;

  useEffect(() => {
    if (canCountPlayTime) return launchAnalytics.watchPlayTime();
  }, [canCountPlayTime, launchAnalytics]);

  useEffect(() => {
    const iframe = frameRef.current;

    if (!iframe) {
      return;
    }

    function postAspectRatioMode() {
      try {
        iframe.contentWindow?.postMessage(
          {
            type: SCUMMWEB_ASPECT_RATIO_MESSAGE_TYPE,
            mode: immersiveMode.isMobileViewport && !usesCommandInput ? "fit-height" : "preserve",
          },
          window.location.origin,
        );
      } catch {}
    }

    postAspectRatioMode();
    iframe.addEventListener("load", postAspectRatioMode);

    return () => {
      iframe.removeEventListener("load", postAspectRatioMode);
    };
  }, [frameSrc, immersiveMode.isMobileViewport, usesCommandInput]);

  useEffect(() => {
    setExitHref(getExitHrefFromSrc(frameSrc || src));
  }, [frameSrc, src]);

  useEffect(() => {
    recordRecentGameTarget(catalogLaunch ? target : game?.recentGameId);
  }, [catalogLaunch, game?.recentGameId, target]);

  useEffect(() => {
    let focusTimer = 0;
    let attempts = 0;
    const iframe = frameRef.current;

    if (!iframe) {
      return;
    }

    function scheduleFocusAttempt() {
      if (focusTimer) {
        return;
      }

      const runAttempt = () => {
        attempts += 1;
        focusTimer = 0;

        const owner = iframe.ownerDocument;
        if (owner?.documentElement.hasAttribute("data-dpad-navigation") &&
          owner.activeElement?.closest(".game-route-controls, .game-route-bottom-actions")) return;

        if (focusGameCanvas(frameRef.current) || attempts >= 40) {
          return;
        }

        focusTimer = window.setTimeout(runAttempt, 250);
      };

      runAttempt();
    }

    scheduleFocusAttempt();
    iframe.addEventListener("load", scheduleFocusAttempt);

    return () => {
      iframe.removeEventListener("load", scheduleFocusAttempt);

      if (focusTimer) {
        window.clearTimeout(focusTimer);
      }
    };
  }, [frameSrc]);

  function dismissSkipIntroButton() {
    bootState.dismissSkipIntroButton();
    touchClick.unlockTouchControls();
  }

  useEffect(() => {
    if (!skipIntro || !bootState.showSkipIntroButton) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      dismissSkipIntroButton();
    }, skipIntro.durationMinutes * 60 * 1000);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [bootState.showSkipIntroButton, frameSrc, skipIntro]);

  useEffect(() => {
    if (!skipIntro || !bootState.showSkipIntroButton) {
      return;
    }

    const iframe = frameRef.current;

    function handleEscapeKeydown(event) {
      if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) {
        return;
      }

      if (!/^esc(?:ape)?$/i.test(event.key || "")) {
        return;
      }

      dismissSkipIntroButton();
    }

    function addFrameListeners() {
      try {
        iframe?.contentWindow?.addEventListener("keydown", handleEscapeKeydown, true);
        iframe?.contentDocument?.addEventListener("keydown", handleEscapeKeydown, true);
      } catch {}
    }

    function removeFrameListeners() {
      try {
        iframe?.contentWindow?.removeEventListener("keydown", handleEscapeKeydown, true);
        iframe?.contentDocument?.removeEventListener("keydown", handleEscapeKeydown, true);
      } catch {}
    }

    window.addEventListener("keydown", handleEscapeKeydown, true);
    addFrameListeners();
    iframe?.addEventListener("load", addFrameListeners);

    return () => {
      window.removeEventListener("keydown", handleEscapeKeydown, true);
      iframe?.removeEventListener("load", addFrameListeners);
      removeFrameListeners();
    };
  }, [bootState.showSkipIntroButton, frameSrc, skipIntro]);

  function handleExitClick() {
    return navigateHome(exitHref);
  }

  function handleControlMouseDown(event) {
    event.preventDefault();
  }

  const gameMenuShortcut = getGameMenuShortcut(game);

  async function handleGameMenuClick() {
    if (!gameMenuShortcut) return;
    await dispatchSyntheticKeypressSequence(frameRef.current, gameMenuShortcut);
  }

  function handleCommandSubmit(event) {
    event.preventDefault();
    const input = event.currentTarget.elements.namedItem("command");
    if (dispatchGameCommand(frameRef.current, input.value)) {
      input.value = "";
      input.blur();
    }
  }

  function handleSkipIntroClick() {
    dismissSkipIntroButton();

    if (!skipIntro) {
      return;
    }

    setReadySignal(null);
    setSkipIntroConsumed(true);
    if (catalogArchiveUrl) {
      setFrameSrc(null);
      setArchiveFrameDocument(null);
      setCatalogIntroLaunch(skipIntro);
      return;
    }
    setFrameSrc((currentSrc) => buildSkipIntroLaunchSrc(currentSrc, target, skipIntro, window.location.href));
  }

  const showSkipIntroAction = bootState.showSkipIntroButton && skipIntro && !bootState.hasBootFailed;
  const showSkipIntroBottomAction = showSkipIntroAction && !showBootOverlay;
  const remoteMouseReady = !showBootOverlay && !showSkipIntroBottomAction && !usesCommandInput;
  useEffect(() => {
    const iframe = frameRef.current;
    if (!remoteMouseReady || !iframe) return;
    let active = true;
    let stop;
    void isTvBrowser(navigator).then((isTv) => {
      if (active && isTv) stop = observeRemoteMouse(window, iframe);
    });
    return () => { active = false; stop?.(); };
  }, [remoteMouseReady, frameSrc]);

  const showExitControl = true;
  const showFullscreenControl =
    !immersiveMode.isMobileViewport && immersiveMode.canFullscreen && bootState.hasBootPresentationCompleted;
  const showGameMenuButton =
    Boolean(gameMenuShortcut) && bootState.showGameMenuButton && !hasBootFailed;
  const showBottomActions = showSkipIntroBottomAction || showTouchMouse;

  return (
    <div className={`game-route-shell${showCommandInput ? " has-command-input" : ""}`} ref={shellRef}>
      <GameBootOverlay
        bootStatusText={archiveError || (loadArchive && !archivePrepared
          ? archiveCached ? "Opening cached game…" : archiveProgress === null ? archiveLoadingText : gameLoadingStatus(archiveProgress)
          : bootState.bootStatusText)}
        game={game}
        hasBootFailed={hasBootFailed}
        showBootOverlay={showBootOverlay}
        title={title}
      />
      <GamePlayerControls
        autoHide={bootState.hasBootPresentationCompleted && !showBootOverlay && !immersiveMode.isMobileViewport}
        frameRef={frameRef}
        menuShortcut={gameMenuShortcut}
        handleControlMouseDown={handleControlMouseDown}
        isFullscreen={immersiveMode.isFullscreen}
        onExit={handleExitClick}
        onOpenMenu={handleGameMenuClick}
        onSkipIntro={handleSkipIntroClick}
        onTouchLeftClick={() => touchClick.sendTouchClick("left")}
        onTouchRightClick={() => touchClick.sendTouchClick("right")}
        onToggleFullscreen={immersiveMode.handleFullscreenToggle}
        showBottomActions={showBottomActions}
        showExitControl={showExitControl}
        showFullscreenControl={showFullscreenControl}
        showGameMenuButton={showGameMenuButton}
        showSkipIntroAction={showSkipIntroBottomAction}
        showTouchClickButtons={showTouchMouse}
      />
      <GameTouchCursorPad
        indicatorOffset={touchCursorPad.indicatorOffset}
        onPointerCancel={touchCursorPad.handlePointerCancel}
        onPointerDown={touchCursorPad.handlePointerDown}
        onPointerMove={touchCursorPad.handlePointerMove}
        onPointerUp={touchCursorPad.handlePointerUp}
        showTouchCursorPad={showTouchMouse}
      />
      {showCommandInput ? (
        <form className="game-route-command" onSubmit={handleCommandSubmit}>
          <input
            aria-label="Game command"
            autoCapitalize="off"
            autoComplete="off"
            autoCorrect="off"
            enterKeyHint="send"
            maxLength={255}
            name="command"
            pattern="[ -~]*"
            placeholder="Type a command"
            spellCheck={false}
            title="Use letters, numbers, spaces, or basic punctuation."
            type="text"
          />
          <button type="submit">Send</button>
        </form>
      ) : null}
      {frameSrc && !archiveError ? <iframe
        key={loadArchive ? frameSrc : undefined}
        allow="autoplay; fullscreen"
        className="game-route-frame"
        data-scummvm-route-frame="true"
        data-scummvm-target={target}
        ref={frameRef}
        loading="eager"
        src={loadArchive ? "about:blank" : frameSrc}
        srcDoc={archiveFrameDocument || undefined}
        title={title}
      /> : null}
    </div>
  );
}
