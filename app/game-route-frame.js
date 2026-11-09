"use client";

import { captureMessage, withScope } from "@sentry/nextjs";
import { Keyboard, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { buildSkipIntroLaunchSrc } from "./skip-intro-config.mjs";
import { readCatalogGameArchive } from "./game-bucket.mjs";
import { gameLoadingStatus } from "./game-loading-status.mjs";
import { isTvBrowser } from "./controller-device.mjs";
import GameBootOverlay from "./game-player/GameBootOverlay";
import GamePlayerControls from "./game-player/GamePlayerControls";
import GameTouchCursorPad from "./game-player/GameTouchCursorPad";
import { GameDirectionPad, GrimTouchActions } from "./game-player/GameTouchGamepad";
import { createGameLaunchAnalytics } from "./game-player/game-launch-analytics.mjs";
import { observeStartupDiagnostics } from "./game-player/startup-diagnostics.mjs";
import { withGameTelemetry } from "./game-player/telemetry.mjs";
import { dispatchGameCommand, dispatchHugoCommand, dispatchSyntheticKeypressSequence } from "./game-player/keyboard";
import { getMobileControlMode } from "./game-player/mobile-controls.mjs";
import { getGameMenuShortcut } from "./game-player/game-menu.mjs";
import { observeRemotePlayerInput } from "./game-player/game-mouse.mjs";
import { enterImmersiveMode, isGameFullscreen, isTouchMobileClient } from "./game-player/immersive-mode.mjs";
import { observeRemoteBack } from "./game-player/remote-back.mjs";
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
  "qfi-demo": { archiveLimit: 300 * MIB, expandedLimit: 300 * MIB, timeoutMs: 600_000 },
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

    if (!canvas) {
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
  const commandInputRef = useRef(null);
  const commandDispatchRef = useRef(null);
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
  const [compatibilityWarnings, setCompatibilityWarnings] = useState([]);
  const [skipIntroConsumed, setSkipIntroConsumed] = useState(false);
  const [catalogIntroLaunch, setCatalogIntroLaunch] = useState(null);
  const [remoteToolbarOpen, setRemoteToolbarOpen] = useState(false);
  const [commandOpen, setCommandOpen] = useState(false);
  const [commandSending, setCommandSending] = useState(false);
  const restoreFullscreenOnResume = useRef(false);
  const fullscreenExitExpected = useRef(false);
  const restoreRemoteFullscreen = useCallback(() => {
    if (!restoreFullscreenOnResume.current) return;
    restoreFullscreenOnResume.current = false;
    void enterImmersiveMode(document.documentElement);
  }, []);
  const resumeRemoteGame = useCallback(() => {
    restoreRemoteFullscreen();
    setRemoteToolbarOpen(false);
    // Restore focus after React removes inert from the game frame.
    window.requestAnimationFrame(() => {
      const skipButton = shellRef.current?.querySelector(".game-route-skip-intro-button");
      if (skipButton) skipButton.focus({ preventScroll: true });
      else if (frameRef.current) focusGameCanvas(frameRef.current);
      else document.activeElement?.blur();
    });
  }, [restoreRemoteFullscreen]);
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
    fullscreenExitExpected.current = true;
    // Keep the landscape lock until the mobile player has left the screen.
    if (!isTouchMobileClient()) await immersiveMode.exitImmersiveMode();
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
  const waitingForLandscape = immersiveMode.isTouchMobile && !immersiveMode.isLandscapeViewport;
  const showBootOverlay = !bootState.hasBootCompleted || hasBootFailed;
  const showSkipIntroBottomAction = Boolean(skipIntro) && bootState.showSkipIntroButton && !showBootOverlay && !waitingForLandscape;
  const mobileControlsReady =
    immersiveMode.isMobileViewport && !waitingForLandscape && bootState.hasBootCompleted && !hasBootFailed;
  const mobileControlMode = getMobileControlMode(readySignal?.detectedGame ?? game ?? undefined);
  const showCommandInput = mobileControlsReady && (mobileControlMode === "command" || mobileControlMode === "hugo");
  const showCommandForm = showCommandInput && commandOpen;
  const showDirectionPad = mobileControlsReady && !showCommandForm &&
    (mobileControlMode === "grim" || mobileControlMode === "hugo");
  const showGrimActions = mobileControlsReady && mobileControlMode === "grim";
  const showTouchMouse = mobileControlsReady && mobileControlMode === "mouse";
  const touchCursorPad = useTouchCursorPad({
    enabled: showTouchMouse,
    frameRef,
  });

  useEffect(() => observeStartupDiagnostics(window, frameRef), []);

  useEffect(() => {
    const viewport = window.visualViewport;
    const shell = shellRef.current;
    if (!immersiveMode.isMobileViewport || !viewport || !shell) return;
    function fitVisibleHeight() {
      // Browser chrome and the keyboard can make the visible area shorter than
      // the layout viewport. Leave pinch zoom under the player's control.
      if (viewport.scale === 1 && viewport.height > 0) {
        shell.style.setProperty("--game-visible-height", `${viewport.height}px`);
      } else {
        shell.style.removeProperty("--game-visible-height");
      }
    }
    fitVisibleHeight();
    viewport.addEventListener("resize", fitVisibleHeight);
    return () => {
      viewport.removeEventListener("resize", fitVisibleHeight);
      shell.style.removeProperty("--game-visible-height");
    };
  }, [immersiveMode.isMobileViewport]);

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
      if (event.data?.type === "scummweb:compatibility-warning") {
        const { href, message } = event.data;
        if (frameSrc && event.source === frameRef.current?.contentWindow &&
            typeof href === "string" && getNormalizedFrameHref(href) === frameSrc &&
            typeof message === "string" && message.trim()) {
          setCompatibilityWarnings((current) => current.includes(message) ? current : [...current, message]);
        }
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
        const detectedGame = iframeWindow.__scummwebSaveStatus;
        setReadySignal({
          detectedGame: detectedGame?.engineId && detectedGame?.gameId
            ? { engineId: detectedGame.engineId, gameId: detectedGame.gameId }
            : null,
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
    setCompatibilityWarnings([]);
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
        const shellUrl = new URL(launchSrc, window.location.origin);
        shellUrl.searchParams.set("hostCompatibilityWarning", "1");
        launchSrc = withGameTelemetry(`${shellUrl.pathname}${shellUrl.search}${shellUrl.hash}`, window.location.href);
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
    readySignal?.reason === "rendered-frame-detected" && !showBootOverlay && !waitingForLandscape;

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
            mode: immersiveMode.isMobileViewport && mobileControlMode === "mouse" ? "fit-height" : "preserve",
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
  }, [frameSrc, immersiveMode.isMobileViewport, mobileControlMode]);

  useEffect(() => {
    setCommandOpen(false);
    setCommandSending(false);
    return () => {
      commandDispatchRef.current?.abort();
      commandDispatchRef.current = null;
    };
  }, [frameSrc]);

  useEffect(() => {
    if (!showCommandInput) setCommandOpen(false);
  }, [showCommandInput]);

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

    if (!iframe || waitingForLandscape) {
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
        if (commandInputRef.current && owner?.activeElement === commandInputRef.current) return;
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
  }, [frameSrc, waitingForLandscape]);

  function dismissSkipIntroButton() {
    bootState.dismissSkipIntroButton();
    touchClick.unlockTouchControls();
  }

  useEffect(() => {
    if (!showSkipIntroBottomAction) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      dismissSkipIntroButton();
    }, skipIntro.durationMinutes * 60 * 1000);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [showSkipIntroBottomAction, frameSrc, skipIntro]);

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
    if (remoteToolbarOpen) {
      restoreRemoteFullscreen();
      setRemoteToolbarOpen(false);
      await new Promise((resolve) => window.requestAnimationFrame(resolve));
    }
    await dispatchSyntheticKeypressSequence(frameRef.current, gameMenuShortcut);
  }

  function handleFullscreenToggle() {
    fullscreenExitExpected.current = isGameFullscreen(shellRef.current);
    restoreFullscreenOnResume.current = false;
    return immersiveMode.handleFullscreenToggle();
  }

  function openCommand() {
    // Mobile browsers require focus during the tap that opens the field.
    flushSync(() => setCommandOpen(true));
    commandInputRef.current?.focus({ preventScroll: true });
  }

  function closeCommand() {
    commandInputRef.current?.blur();
    setCommandOpen(false);
    focusGameCanvas(frameRef.current);
  }

  async function handleCommandSubmit(event) {
    event.preventDefault();
    if (commandDispatchRef.current) return;
    const input = event.currentTarget.elements.namedItem("command");
    let sent;
    if (mobileControlMode === "hugo" && input.value.length > 16) {
      const controller = new AbortController();
      commandDispatchRef.current = controller;
      setCommandSending(true);
      try {
        sent = await dispatchHugoCommand(frameRef.current, input.value, controller.signal);
      } finally {
        if (commandDispatchRef.current === controller) {
          commandDispatchRef.current = null;
          setCommandSending(false);
        }
      }
      if (controller.signal.aborted) return;
    } else {
      sent = dispatchGameCommand(frameRef.current, input.value);
    }
    if (sent) {
      input.value = "";
      input.blur();
      setCommandOpen(false);
    }
  }

  function handleSkipIntroClick() {
    dismissSkipIntroButton();

    if (!skipIntro) {
      return;
    }

    setReadySignal(null);
    setCompatibilityWarnings([]);
    setSkipIntroConsumed(true);
    if (catalogArchiveUrl) {
      setFrameSrc(null);
      setArchiveFrameDocument(null);
      setCatalogIntroLaunch(skipIntro);
      return;
    }
    setFrameSrc((currentSrc) => buildSkipIntroLaunchSrc(currentSrc, target, skipIntro, window.location.href));
  }

  const remoteMouseReady = !showBootOverlay && !showSkipIntroBottomAction && game?.engineId !== "adl";
  useEffect(() => {
    if (!remoteMouseReady || remoteToolbarOpen) return;
    let active = true;
    let stop;
    void isTvBrowser(navigator).then((isTv) => {
      if (active && isTv) stop = observeRemotePlayerInput(window, frameRef.current);
    });
    return () => { active = false; stop?.(); };
  }, [remoteMouseReady, remoteToolbarOpen, frameSrc]);

  useEffect(() => {
    let active = true;
    let stop;
    void isTvBrowser(navigator).then((isTv) => {
      if (!active || !isTv) return;
      stop = observeRemoteBack(window, {
        onBack() {
          const dialog = shellRef.current?.querySelector("dialog:modal");
          if (dialog) dialog.close();
          else if (remoteToolbarOpen) resumeRemoteGame();
          else setRemoteToolbarOpen(true);
        },
        onFullscreenExit() {
          const expected = fullscreenExitExpected.current;
          fullscreenExitExpected.current = false;
          if (expected || remoteToolbarOpen) return;
          restoreFullscreenOnResume.current = true;
          setRemoteToolbarOpen(true);
        },
      });
    });
    return () => { active = false; stop?.(); };
  }, [remoteToolbarOpen, resumeRemoteGame]);

  const showExitControl = true;
  const showFullscreenControl =
    immersiveMode.canFullscreen && !immersiveMode.isTouchMobile && bootState.hasBootPresentationCompleted;
  const showGameMenuButton =
    Boolean(gameMenuShortcut) && bootState.showGameMenuButton && !hasBootFailed && !waitingForLandscape;
  const touchActions = showGrimActions ? <GrimTouchActions frameRef={frameRef} /> : showCommandInput && !showCommandForm ? (
    <button
      aria-controls="game-route-command"
      aria-label="Open keyboard"
      className="game-route-control-button is-gamepad"
      onClick={openCommand}
      title="Open keyboard"
      type="button"
    >
      <Keyboard aria-hidden="true" size={20} />
    </button>
  ) : null;
  const showBottomActions = showSkipIntroBottomAction || showTouchMouse || Boolean(touchActions);

  return (
    <div
      className={`game-route-shell${showCommandForm ? " has-command-input" : ""}`}
      data-mobile-orientation={immersiveMode.isTouchMobile ? "landscape" : undefined}
      ref={shellRef}
    >
      <div className="mobile-orientation-message">
        <p role="status">Rotate your device to landscape to play.</p>
        {immersiveMode.canFullscreen && !immersiveMode.isFullscreen && (
          <button className="secondary-button" type="button" onClick={() => void enterImmersiveMode(document.documentElement)}>
            Enter fullscreen
          </button>
        )}
      </div>
      <GameBootOverlay
        archiveBytes={loadArchive && !archivePrepared && !archiveCached ? archiveProgress?.loaded : undefined}
        bootStatusText={archiveError || (loadArchive && !archivePrepared
          ? archiveCached ? "Opening cached game…" : archiveProgress === null ? archiveLoadingText : gameLoadingStatus(archiveProgress)
          : bootState.bootStatusText)}
        game={game}
        hasBootFailed={hasBootFailed}
        showBootOverlay={showBootOverlay}
        title={title}
      />
      <GamePlayerControls
        autoHide={bootState.hasBootPresentationCompleted && !showBootOverlay && !immersiveMode.isMobileViewport && !remoteToolbarOpen}
        compatibilityWarnings={waitingForLandscape ? [] : compatibilityWarnings}
        frameRef={frameRef}
        menuShortcut={gameMenuShortcut}
        handleControlMouseDown={handleControlMouseDown}
        isFullscreen={immersiveMode.isFullscreen}
        onExit={handleExitClick}
        onOpenMenu={handleGameMenuClick}
        onResumeGame={resumeRemoteGame}
        onSkipIntro={handleSkipIntroClick}
        onTouchLeftClick={() => touchClick.sendTouchClick("left")}
        onTouchRightClick={() => touchClick.sendTouchClick("right")}
        onToggleFullscreen={handleFullscreenToggle}
        showBottomActions={showBottomActions}
        showExitControl={showExitControl}
        showFullscreenControl={showFullscreenControl}
        showGameMenuButton={showGameMenuButton}
        showSkipIntroAction={showSkipIntroBottomAction}
        showTouchClickButtons={showTouchMouse}
        toolbarFocused={remoteToolbarOpen}
        touchActions={touchActions}
      />
      <GameTouchCursorPad
        indicatorOffset={touchCursorPad.indicatorOffset}
        onPointerCancel={touchCursorPad.handlePointerCancel}
        onPointerDown={touchCursorPad.handlePointerDown}
        onPointerMove={touchCursorPad.handlePointerMove}
        onPointerUp={touchCursorPad.handlePointerUp}
        showTouchCursorPad={showTouchMouse}
      />
      {showDirectionPad ? (
        <GameDirectionPad
          frameRef={frameRef}
          hold={mobileControlMode === "grim"}
          key={frameSrc}
        />
      ) : null}
      {showCommandInput ? (
        <form className="game-route-command" hidden={!showCommandForm} id="game-route-command" onSubmit={handleCommandSubmit}>
          <input
            aria-label="Game command"
            autoCapitalize="off"
            autoComplete="off"
            autoCorrect="off"
            enterKeyHint="send"
            maxLength={mobileControlMode === "hugo" ? 38 : 255}
            name="command"
            pattern="[ -~]*"
            placeholder="Type a command"
            readOnly={commandSending}
            ref={commandInputRef}
            spellCheck={false}
            title="Use letters, numbers, spaces, or basic punctuation."
            type="text"
          />
          <button disabled={commandSending} type="submit">Send</button>
          <button aria-label="Close keyboard" disabled={commandSending} onClick={closeCommand} type="button">
            <X aria-hidden="true" size={18} />
          </button>
        </form>
      ) : null}
      {frameSrc && !archiveError ? <iframe
        key={loadArchive ? frameSrc : undefined}
        allow="autoplay; fullscreen"
        className="game-route-frame"
        data-scummvm-route-frame="true"
        data-scummvm-target={target}
        inert={remoteToolbarOpen || waitingForLandscape}
        ref={frameRef}
        loading="eager"
        src={loadArchive ? "about:blank" : frameSrc}
        srcDoc={archiveFrameDocument || undefined}
        title={title}
      /> : null}
    </div>
  );
}
