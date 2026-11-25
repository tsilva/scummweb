"use client";

import { withBrowserSentry } from "../lib/browser-sentry.mjs";
import { Keyboard } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { buildSkipIntroLaunchSrc } from "./skip-intro-config.mjs";
import { readCatalogGameArchive } from "./game-bucket.mjs";
import { dropboxEnabled, prepareDropboxLaunch, prioritizeDropboxGameplay, reportDropboxSave } from "./dropbox/bridge.mjs";
import { gameLoadingStatus } from "./game-loading-status.mjs";
import { isTvBrowser } from "./controller-device.mjs";
import GameBootOverlay from "./game-player/GameBootOverlay";
import GamePlayerControls from "./game-player/GamePlayerControls";
import GameTouchCursorPad from "./game-player/GameTouchCursorPad";
import GameVoiceCommand from "./game-player/GameVoiceCommand";
import { isZorkVoiceGame } from "./game-player/voice-command.mjs";
import { GameMovementStick, GameTouchGamepad } from "./game-player/GameTouchGamepad";
import { createGameLaunchAnalytics } from "./game-player/game-launch-analytics.mjs";
import { getFilesystemStartupDiagnostics, getStartupTimeoutStep, observeStartupDiagnostics } from "./game-player/startup-diagnostics.mjs";
import { withGameTelemetry } from "./game-player/telemetry.mjs";
import { getStoryProgressRevision, observeStoryProgress } from "./game-player/story-progress.mjs";
import { observePlayHistory } from "./game-player/play-history.mjs";
import storyProgressIndex from "../public/game-progress/index.json";
import { dispatchGameCommand, dispatchHugoCommand, dispatchSyntheticKeypressSequence } from "./game-player/keyboard";
import { getDungeonWalkLayout, getMobileControlMode } from "./game-player/mobile-controls.mjs";
import { getGameMenuShortcut } from "./game-player/game-menu.mjs";
import { observeRemotePlayerInput } from "./game-player/game-mouse.mjs";
import { enterImmersiveMode, isGameFullscreen, isTouchMobileClient } from "./game-player/immersive-mode.mjs";
import { observeRemoteBack } from "./game-player/remote-back.mjs";
import { useBootState } from "./game-player/useBootState";
import { useImmersiveMode } from "./game-player/useImmersiveMode";
import { useTouchCursorPad } from "./game-player/useTouchCursorPad";
import { sendZipGameFiles } from "./home-shell/zip-game-player";
import { recordRecentGameTarget } from "./recent-games";
import "./styles/game-player-frame.css";
import "./styles/game-controls.css";
import "./styles/game-menu.css";

const SCUMMWEB_FRAME_MESSAGE_SOURCE = "scummweb";
const SCUMMWEB_ASPECT_RATIO_MESSAGE_TYPE = "scummweb-aspect-ratio";
const ARCHIVE_FRAME_NAVIGATION_TIMEOUT_MS = 8000;
const ARCHIVE_BOOT_IDLE_TIMEOUT_MS = 120_000;
const ARCHIVE_BOOT_TIMEOUT_MESSAGE = "ScummVM took too long to start. Select Exit game and try again.";
const GRAPHICS_LOST_MESSAGE = "Unsaved progress may be lost.";
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
  "phantasmagoria-demo": { archiveLimit: 400 * MIB, expandedLimit: 450 * MIB, timeoutMs: 900_000 },
  "rtz-demo": { archiveLimit: 150 * MIB, timeoutMs: 600_000 },
  "technobabylon-demo": { archiveLimit: 300 * MIB, expandedLimit: 900 * MIB, timeoutMs: 600_000 },
  "primordia-demo": { archiveLimit: 900 * MIB, expandedLimit: 1024 * MIB, timeoutMs: 900_000 },
  "geminirue-demo": { archiveLimit: 200 * MIB, timeoutMs: 600_000 },
  "sword1-demo": { archiveLimit: 200 * MIB, timeoutMs: 600_000 },
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
}) {
  const loadCatalogArchive = useCallback((signal, onProgress) => readCatalogGameArchive(catalogArchiveUrl, {
    ...catalogArchiveLimits[target], signal, onProgress,
  }), [catalogArchiveUrl, target]);
  const loadArchive = catalogArchiveUrl ? loadCatalogArchive : loadPersonalArchive;
  const catalogLaunch = !loadArchive || Boolean(catalogArchiveUrl);
  const dropboxDestination = game?.saveNamespace || (catalogLaunch && target ? `catalog:${target}` : null);
  const progressVersion = catalogLaunch ? `catalog:${target}` : game?.activityVersion ?? game?.recentGameId;
  const progressSlug = game?.slug;
  const progressRevision = getStoryProgressRevision(storyProgressIndex, progressSlug, catalogLaunch);
  const router = useRouter();
  const shellRef = useRef(null);
  const frameRef = useRef(null);
  const frameBootRef = useRef(null);
  const archiveFiles = useRef(null);
  const archiveReceiver = useRef(null);
  const archiveDelivery = useRef("pending");
  const commandInputRef = useRef(null);
  const commandDispatchRef = useRef(null);
  const [archivePrepared, setArchivePrepared] = useState(false);
  const [archiveError, setArchiveError] = useState("");
  const [archiveProgress, setArchiveProgress] = useState(null);
  const [graphicsRecovery, setGraphicsRecovery] = useState(null);
  const [launchAttempt, setLaunchAttempt] = useState(0);
  const [launchAnalytics] = useState(() => createGameLaunchAnalytics(catalogLaunch ? game?.slug : null));
  const [frameSrc, setFrameSrc] = useState(null);
  const [archiveFrameDocument, setArchiveFrameDocument] = useState(null);
  const [isResuming, setIsResuming] = useState(false);
  const [exitHref, setExitHref] = useState("/");
  const [readySignal, setReadySignal] = useState(null);
  const [gameplayFrameHref, setGameplayFrameHref] = useState(null);
  const [nativeIntroFrameHref, setNativeIntroFrameHref] = useState(null);
  const [compatibilityWarnings, setCompatibilityWarnings] = useState([]);
  const [skipIntroConsumed, setSkipIntroConsumed] = useState(false);
  const [catalogIntroLaunch, setCatalogIntroLaunch] = useState(null);
  const [remoteToolbarOpen, setRemoteToolbarOpen] = useState(false);
  const [commandOpen, setCommandOpen] = useState(false);
  const [commandSending, setCommandSending] = useState(false);
  const [gameMenuOpen, setGameMenuOpen] = useState(false);
  const [gameMenuPage, setGameMenuPage] = useState("menu");
  const [isExiting, setIsExiting] = useState(false);
  const [dungeonTouchMode, setDungeonTouchMode] = useState("cursor");
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
  const skipIntro = isResuming || intro?.checkpointOnly ? null : intro;
  const canSkipNativeIntro = (!catalogLaunch || !intro) && !isResuming &&
    frameSrc !== null && nativeIntroFrameHref === frameSrc;
  const gameplayStarted = frameSrc !== null && gameplayFrameHref === frameSrc;
  const currentReadySignal = readySignal?.href === frameSrc ? readySignal : null;
  const bootState = useBootState({
    frameRef,
    frameSrc,
    readySignal: currentReadySignal,
    skipIntro,
    skipIntroConsumed,
  });
  const immersiveMode = useImmersiveMode({ shellRef });
  const stopPlayHistory = useRef(null);
  const navigateHome = useCallback(async (href) => {
    const flushSaves = frameRef.current?.contentWindow?.__scummwebFlushSaveStorage;
    const flushPlayHistory = stopPlayHistory.current?.();
    // Remove every overlay control before fullscreen teardown or navigation can wait.
    flushSync(() => setIsExiting(true));
    fullscreenExitExpected.current = true;
    // Keep the landscape lock until the mobile player has left the screen.
    if (!isTouchMobileClient()) await immersiveMode.exitImmersiveMode();
    if (flushSaves) {
      try { await flushSaves(); }
      catch { /* The previous committed copy remains available after a failed write. */ }
    }
    if (flushPlayHistory) await flushPlayHistory;
    // Release this frame's save locks before revealing the launcher again.
    flushSync(() => setFrameSrc(null));
    const destination = getSafeHref(href);
    if (catalogLaunch) window.location.replace(destination);
    else router.replace(destination);
  }, [catalogLaunch, router, immersiveMode.exitImmersiveMode]);
  async function restartAfterGraphicsLoss() {
    const failedFrame = frameRef.current;
    setGraphicsRecovery("restarting");
    try { await failedFrame?.contentWindow?.__scummwebFlushSaveStorage?.(); }
    catch { /* The previous committed saves remain available. */ }
    if (frameRef.current !== failedFrame) return;

    // Dispose of the lost context and release this frame's save session.
    // A fresh launch also prepares files again for ZIP-based games.
    flushSync(() => {
      setFrameSrc(null);
      setArchiveFrameDocument(null);
      setArchiveError(null);
      setReadySignal(null);
      setGraphicsRecovery(null);
      setLaunchAttempt((attempt) => attempt + 1);
    });
  }

  const hasBootFailed = Boolean(graphicsRecovery || archiveError) || bootState.hasBootFailed;
  const waitingForLandscape = immersiveMode.isTouchMobile && !immersiveMode.isLandscapeViewport;
  const showBootOverlay = !bootState.hasBootCompleted || hasBootFailed;
  useEffect(() => {
    if (showBootOverlay || waitingForLandscape) setGameMenuOpen(false);
  }, [frameSrc, showBootOverlay, waitingForLandscape]);
  const showSkipIntroBottomAction =
    (canSkipNativeIntro || (Boolean(skipIntro) && bootState.showSkipIntroButton)) &&
    !isExiting && !gameplayStarted && !showBootOverlay && !waitingForLandscape;
  const mobileControlsReady =
    !isExiting && immersiveMode.isMobileViewport && !waitingForLandscape && bootState.hasBootCompleted && !hasBootFailed &&
    !showSkipIntroBottomAction;
  const activeGame = currentReadySignal?.detectedGame ?? game ?? undefined;
  const mobileControlMode = getMobileControlMode(activeGame);
  const usesCommandInput = mobileControlMode === "command" || mobileControlMode === "hugo";
  const showCommandInput = mobileControlsReady && usesCommandInput;
  const showCommandForm = showCommandInput && commandOpen;
  const showHugoStick = mobileControlsReady && !showCommandForm && mobileControlMode === "hugo";
  const showTouchGamepad = mobileControlsReady && ["grim", "monkey4", "castle"].includes(mobileControlMode);
  const dungeonWalkLayout = mobileControlsReady ? getDungeonWalkLayout(activeGame) : null;
  const showTouchWalk = Boolean(dungeonWalkLayout) && dungeonTouchMode === "walk";
  const showTouchMouse = mobileControlsReady && mobileControlMode === "mouse" && !showTouchWalk;
  const touchCursorPad = useTouchCursorPad({
    enabled: showTouchMouse,
    frameRef,
  });

  useEffect(() => observeStartupDiagnostics(window, frameRef), []);

  const closeCommand = useCallback(() => {
    commandInputRef.current?.blur();
    setCommandOpen(false);
    focusGameCanvas(frameRef.current);
  }, []);

  useEffect(() => {
    const viewport = window.visualViewport;
    const shell = shellRef.current;
    // Command games keep the layout viewport so the keyboard can cover the
    // game without resizing it. Other mobile games fit the visible viewport.
    if (usesCommandInput || !immersiveMode.isMobileViewport || !viewport || !shell) return;
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
  }, [immersiveMode.isMobileViewport, usesCommandInput]);

  useLayoutEffect(() => {
    const keyboard = navigator.virtualKeyboard;
    if (!usesCommandInput || !immersiveMode.isMobileViewport || !keyboard) return;

    // Android may still be applying the keyboard inset after the form closes.
    // Keep the viewport policy stable for the player, including during dismissal.
    const previousOverlaysContent = keyboard.overlaysContent;
    keyboard.overlaysContent = true;
    return () => { keyboard.overlaysContent = previousOverlaysContent; };
  }, [immersiveMode.isMobileViewport, usesCommandInput]);

  useLayoutEffect(() => {
    const viewport = window.visualViewport;
    const keyboard = navigator.virtualKeyboard;
    const shell = shellRef.current;
    if (!showCommandForm || !shell || (!viewport && !keyboard)) return;

    // Chromium can report the keyboard directly, even when it overlays the
    // fullscreen player. Other browsers expose the space it leaves visible.
    const initialHeight = viewport?.height ?? window.innerHeight;
    let keyboardWasVisible = false;
    function positionCommandField() {
      if (viewport && (viewport.scale !== 1 || viewport.height <= 0)) return;
      const visibleHeight = viewport?.height ?? window.innerHeight;
      const visibleBottom = (viewport?.offsetTop ?? 0) + visibleHeight;
      const keyboardRect = keyboard?.boundingRect;
      const keyboardTop = keyboardRect?.height > 0 ? keyboardRect.top : visibleBottom;
      const inset = shell.getBoundingClientRect().bottom - Math.min(visibleBottom, keyboardTop);
      shell.style.setProperty("--game-command-inset", `${Math.max(0, inset)}px`);
      // Android Back can hide the IME without blurring the input. Ignore small
      // viewport changes from browser chrome when detecting that dismissal.
      const keyboardVisible = keyboardRect?.height > 0 || initialHeight - visibleHeight > 48;
      if (!keyboardVisible && keyboardWasVisible) closeCommand();
      keyboardWasVisible = keyboardVisible;
    }
    positionCommandField();
    keyboard?.addEventListener("geometrychange", positionCommandField);
    viewport?.addEventListener("resize", positionCommandField);
    viewport?.addEventListener("scroll", positionCommandField);
    return () => {
      keyboard?.removeEventListener("geometrychange", positionCommandField);
      viewport?.removeEventListener("resize", positionCommandField);
      viewport?.removeEventListener("scroll", positionCommandField);
      shell.style.removeProperty("--game-command-inset");
    };
  }, [closeCommand, showCommandForm]);

  useLayoutEffect(() => {
    if (frameBootRef.current?.src !== frameSrc) {
      frameBootRef.current = { src: frameSrc, reported: false, ready: false, archiveTransferred: false };
    }
    const frameBoot = frameBootRef.current;

    function retryAutosave() {
      const rejected = frameRef.current?.contentWindow?.__scummwebStartupAutosave;
      if (frameBoot.ready || !frameSrc || !/^\.scummweb-autosave\.[0-2]$/.test(rejected || "")) return false;
      const url = new URL(frameSrc, window.location.href);
      const excluded = (url.searchParams.get("excludeAutosaves") || "").split(",").filter(Boolean);
      if (excluded.includes(rejected) || url.searchParams.get("continue") !== "1") return false;
      excluded.push(rejected);
      url.searchParams.set("excludeAutosaves", excluded.join(","));
      url.searchParams.delete("launchRetry");
      frameBoot.ready = true; // Fence late messages from the discarded player.
      stopArchiveBootTimer();
      archiveReceiver.current = null;
      setArchiveFrameDocument(null);
      setArchiveError(null);
      setFrameSrc(`${url.pathname}${url.search}${url.hash}`);
      return true;
    }

    function captureStartupReport(title, { stage, level, name, message, status, waitingFor, filesystem }) {
      void withBrowserSentry(({ withScope, captureMessage }) => withScope((scope) => {
        if (!catalogLaunch) {
          // The page URL or navigation breadcrumbs can contain a private ZIP link.
          scope.addEventProcessor(({ request, breadcrumbs, transaction, contexts, ...event }) => {
            const { trace, ...safeContexts } = contexts ?? {};
            return { ...event, contexts: safeContexts };
          });
        }
        captureMessage(title, {
          level,
          tags: {
            component: "scummvm-player",
            startup_stage: stage,
            startup_waiting_for: waitingFor,
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
            ...(filesystem && { filesystem_startup: filesystem }),
          },
        });
      }));
    }

    function filesystemContext(payload) {
      const diagnostics = getFilesystemStartupDiagnostics(payload);
      if (!diagnostics) return;
      return {
        ...diagnostics,
        archive_delivery: loadArchive ? archiveDelivery.current : "not-required",
        archive_prepared: Boolean(archivePrepared || archiveFiles.current || frameBoot.archiveTransferred),
        archive_transferred: frameBoot.archiveTransferred,
      };
    }

    function reportBootError(stage, { name, message, status, filesystem } = {}) {
      const description = BOOT_ERROR_MESSAGES.get(stage);
      if (!frameSrc || !description || frameBoot.ready || frameBoot.reported) return;
      frameBoot.reported = true;
      const waitingFor = stage === "startup-timeout" ? getStartupTimeoutStep(frameRef.current, {
        receiver: archiveReceiver.current,
        transferred: frameBoot.archiveTransferred,
      }) : undefined;
      captureStartupReport(`ScummVM startup failed: ${description}`, {
        stage, level: "error", name, message, status, waitingFor,
        filesystem: stage === "filesystem" ? filesystemContext(filesystem) : undefined,
      });
    }

    const archiveFrame = loadArchive && frameSrc ? frameRef.current : null;
    let archiveBootTimer;

    function restartArchiveBootTimer() {
      if (frameBoot.graphicsLost) return;
      window.clearTimeout(archiveBootTimer);
      archiveBootTimer = window.setTimeout(() => {
        if (frameBoot.ready || frameBootRef.current !== frameBoot) return;
        if (retryAutosave()) return;
        // Keep prepared files available if the runtime becomes ready later.
        reportBootError("startup-timeout");
        setArchiveError(ARCHIVE_BOOT_TIMEOUT_MESSAGE);
      }, ARCHIVE_BOOT_IDLE_TIMEOUT_MS);
    }

    function stopArchiveBootTimer() {
      window.clearTimeout(archiveBootTimer);
      archiveFrame?.removeEventListener("load", restartArchiveBootTimer);
    }

    function finishArchiveBoot() {
      stopArchiveBootTimer();
      frameBoot.ready = true;
      setArchiveError((current) => current === ARCHIVE_BOOT_TIMEOUT_MESSAGE ? null : current);
    }

    if (archiveFrame && archivePrepared) {
      restartArchiveBootTimer();
      archiveFrame.addEventListener("load", restartArchiveBootTimer, { once: true });
    }

    function deliverArchiveFiles() {
      const receiver = archiveReceiver.current;
      if (frameBoot.graphicsLost || !archiveFiles.current || !receiver || receiver !== frameRef.current?.contentWindow) return;
      try {
        sendZipGameFiles(receiver, archiveFiles.current, { saveNamespace: game?.saveNamespace });
        frameBoot.archiveTransferred = true;
        window.performance?.mark?.("scummweb:archive-transferred");
        archiveFiles.current = null;
        restartArchiveBootTimer();
      } catch {
        archiveFiles.current = null;
        stopArchiveBootTimer();
        setArchiveError("Could not prepare this version. Select Exit game and try again.");
      }
    }

    function handleMessage(event) {
      if (event.origin !== window.location.origin || frameBoot.graphicsLost) {
        return;
      }
      if (event.data?.type === "scummvm-graphics-lost") {
        if (frameSrc && event.source === frameRef.current?.contentWindow &&
            typeof event.data.href === "string" && getNormalizedFrameHref(event.data.href) === frameSrc) {
          reportBootError("webgl-context-lost");
          frameBoot.graphicsLost = true;
          stopArchiveBootTimer();
          launchAnalytics.fail("startup_error");
          setGraphicsRecovery("lost");
        }
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
      if (event.data?.type === "scummvm-open-game-menu") {
        if (frameBoot.ready && event.source === frameRef.current?.contentWindow) handleGameMenuClick(event.data.page);
        return;
      }
      if (event.data?.type === "scummvm-boot-error") {
        if (event.source && event.source === frameRef.current?.contentWindow &&
            typeof event.data.href === "string" && getNormalizedFrameHref(event.data.href) === frameSrc) {
          if (!retryAutosave()) reportBootError(event.data.stage, event.data);
        }
        return;
      }
      if (event.data?.type === "scummweb:saves-listed" && event.source === frameRef.current?.contentWindow) {
        reportDropboxSave(event.source, game);
        if (new URL(frameSrc, window.location.href).searchParams.get("continue") === "1") {
          setIsResuming(Number.isInteger(event.data.latestSlot));
        }
        window.dispatchEvent(new Event("scummweb:saves-changed"));
        return;
      }
      if (event.data?.type === "scummweb:save-storage-error" && event.source === frameRef.current?.contentWindow) {
        const warning = "Could not store the latest save on this device. Your previous saves are retained.";
        setCompatibilityWarnings(current => current.includes(warning) ? current : [...current, warning]);
        return;
      }

      if (event.data?.type === "scummweb:save-session-busy" && event.source === frameRef.current?.contentWindow) {
        stopArchiveBootTimer();
        // A lock can appear after following a launch link. Return to the
        // launch controls, which stay disabled until the lock is released.
        void navigateHome(getExitHrefFromSrc(frameSrc || src));
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
            finishArchiveBoot();
            if (!catalogLaunch) {
              setReadySignal((current) => current ?? { href: frameSrc, reason: "archive-running" });
            }
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

      if (event.data?.type === "scummvm-intro-availability") {
        if (frameSrc && event.source === frameRef.current?.contentWindow &&
            event.data.source === SCUMMWEB_FRAME_MESSAGE_SOURCE &&
            getNormalizedFrameHref(event.data.href) === frameSrc) {
          setNativeIntroFrameHref(event.data.available === true ? frameSrc : null);
        }
        return;
      }

      if (event.data?.type === "scummvm-ready" || event.data?.type === "scummvm-gameplay-started") {
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

        if (event.data.type === "scummvm-gameplay-started") {
          setGameplayFrameHref(messageFrameHref);
          return;
        }

        if (event.data.reason === "rendered-frame-timeout" && retryAutosave()) return;
        finishArchiveBoot();
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
          const filesystem = filesystemContext(event.data.filesystem);
          if (!frameBoot.saveOpenRecoveryReported && filesystem?.step === "save-open" &&
              filesystem.open_attempts === 2 && filesystem.first_open_error_name === "UnknownError" &&
              !filesystem.retry_open_error_name && filesystem.first_open_ms !== undefined &&
              filesystem.retry_open_ms !== undefined) {
            frameBoot.saveOpenRecoveryReported = true;
            captureStartupReport("ScummVM recovered from a save database open failure", {
              stage: "save-open-recovered", level: "info", filesystem,
            });
          }
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
        if (retryAutosave()) return;
        reportBootError("runtime-exit", { status: event.data.status });
        launchAnalytics.fail("startup_error");
      }
      navigateHome(event.data.href || "/");
    }

    window.addEventListener("message", handleMessage);
    deliverArchiveFiles();

    return () => {
      stopArchiveBootTimer();
      window.removeEventListener("message", handleMessage);
    };
  }, [archiveFrameDocument, archivePrepared, catalogLaunch, frameSrc, game?.engineId, game?.saveNamespace, game?.slug, launchAnalytics, loadArchive, navigateHome, src, target]);

  useLayoutEffect(() => {
    const iframe = frameRef.current;
    if (!loadArchive || !frameSrc || archiveFrameDocument || !iframe?.contentWindow) return;

    const navigationController = new AbortController();
    function needsRetry() {
      if (navigationController.signal.aborted || iframe !== frameRef.current) return false;
      const documentUrl = iframe.contentDocument?.URL;
      return !documentUrl || documentUrl === "about:blank";
    }
    if (!needsRetry()) return;

    // Keep navigation and its recovery independent of ZIP preparation.
    // The preceding layout effect has already installed the file handoff listener.
    iframe.contentWindow.location.replace(new URL(frameSrc, window.location.href).href);
    const navigationTimer = window.setTimeout(async () => {
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
        if (needsRetry()) setArchiveError("Could not load ScummVM. Select Exit game and try again.");
      }
    }, ARCHIVE_FRAME_NAVIGATION_TIMEOUT_MS);

    return () => {
      navigationController.abort();
      window.clearTimeout(navigationTimer);
    };
  }, [archiveFrameDocument, frameSrc, loadArchive]);

  useEffect(() => {
    const controller = new AbortController();
    setReadySignal(null);
    setGameplayFrameHref(null);
    setNativeIntroFrameHref(null);
    setCompatibilityWarnings([]);
    setArchiveProgress(null);
    setArchivePrepared(false);
    archiveFiles.current = null;
    archiveReceiver.current = null;
    archiveDelivery.current = "pending";
    setSkipIntroConsumed(catalogIntroLaunch !== null);

    async function openGame() {
      try {
        const isolatedSave = new URLSearchParams(window.location.search).has("agentSaveScope");
        if (!isolatedSave && dropboxEnabled()) {
          await prepareDropboxLaunch(dropboxDestination, window.location.hash === "#continue" ? game : null);
        }
        if (controller.signal.aborted) return;
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
        if (target && !game?.saveNamespace) shellUrl.searchParams.set("catalogSaveTarget", target);
        shellUrl.searchParams.set("hostCompatibilityWarning", "1");
        shellUrl.searchParams.set("hostPlayer", "1");
        // The hosted shell uses this parameter for local rotating save checkpoints.
        shellUrl.searchParams.set("dropbox", "true");
        if (progressVersion && progressRevision && !isolatedSave) {
          shellUrl.searchParams.set("telemetry", "1");
        }
        launchSrc = withGameTelemetry(`${shellUrl.pathname}${shellUrl.search}${shellUrl.hash}`, window.location.href);
        if (loadArchive) {
          // Load/compile ScummVM while the archive downloads or opens. The
          // handoff below supports either side becoming ready first.
          window.performance?.mark?.("scummweb:runtime-requested");
          setFrameSrc(launchSrc);
          const files = await loadArchive(controller.signal, (progress, details) => {
            if (!controller.signal.aborted) {
              if (details?.cached) archiveDelivery.current = "cached";
              else if (details?.downloading) archiveDelivery.current = "downloading";
              else if (progress === 100 && details?.loaded > 0) archiveDelivery.current = "downloaded";
              setArchiveProgress(details ?? null);
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
  }, [catalogIntroLaunch, catalogLaunch, dropboxDestination, game, intro, launchAnalytics, launchAttempt, loadArchive, progressRevision, progressVersion, src, target]);

  useEffect(() => {
    if (!currentReadySignal || !dropboxEnabled() || new URL(window.location.href).searchParams.has("agentSaveScope")) return;
    return prioritizeDropboxGameplay(dropboxDestination);
  }, [currentReadySignal, dropboxDestination]);

  useEffect(() => {
    if (!currentReadySignal || !frameRef.current || !progressVersion || !progressRevision ||
        new URL(window.location.href).searchParams.has("agentSaveScope")) return;
    return observeStoryProgress(window, frameRef.current, {
      version: progressVersion, slug: progressSlug, revision: progressRevision,
    });
  }, [currentReadySignal, progressRevision, progressSlug, progressVersion]);

  useEffect(() => {
    if (bootState.hasBootFailed) launchAnalytics.fail("startup_error");
  }, [bootState.hasBootFailed, launchAnalytics]);

  const canCountPlayTime =
    currentReadySignal?.reason === "rendered-frame-detected" && !showBootOverlay && !waitingForLandscape;

  useEffect(() => {
    if (canCountPlayTime) return launchAnalytics.watchPlayTime();
  }, [canCountPlayTime, launchAnalytics]);

  const canRecordPlayHistory = Boolean(currentReadySignal) &&
    currentReadySignal.reason !== "rendered-frame-timeout" && !showBootOverlay &&
    !waitingForLandscape && !gameMenuOpen && !remoteToolbarOpen && !isExiting;
  useEffect(() => {
    if (!canRecordPlayHistory || new URL(window.location.href).searchParams.has("agentSaveScope")) return;
    const stop = observePlayHistory(window, progressVersion);
    stopPlayHistory.current = stop;
    return () => { stop?.(); };
  }, [canRecordPlayHistory, progressVersion]);

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
    if (!currentReadySignal || hasBootFailed || currentReadySignal.reason === "rendered-frame-timeout" ||
        new URL(window.location.href).searchParams.has("agentSaveScope")) return;
    recordRecentGameTarget(catalogLaunch ? target : game?.recentGameId);
  }, [catalogLaunch, currentReadySignal, game?.recentGameId, hasBootFailed, target]);

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

  function handleExitClick() {
    return navigateHome(exitHref);
  }

  function handleControlMouseDown(event) {
    event.preventDefault();
  }

  const gameMenuShortcut = getGameMenuShortcut(game);

  function handleGameMenuClick(page) {
    const gameDocument = frameRef.current?.contentDocument;
    if (gameDocument?.pointerLockElement) gameDocument.exitPointerLock?.();
    setGameMenuPage(page === "load" ? "load" : "menu");
    setGameMenuOpen(true);
  }

  function closeGameMenu() {
    setGameMenuOpen(false);
    resumeRemoteGame();
  }

  async function openNativeMenu() {
    closeGameMenu();
    await new Promise((resolve) => window.requestAnimationFrame(resolve));
    const globalMenu = { key: "F5", code: "F5", keyCode: 116, ctrlKey: true };
    await dispatchSyntheticKeypressSequence(frameRef.current, gameMenuShortcut ?? globalMenu);
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

  function handleCommandKeyDown(event) {
    if (event.key === "Escape" && !event.nativeEvent.isComposing) {
      event.preventDefault();
      closeCommand();
    }
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
    if (canSkipNativeIntro) {
      const frame = frameRef.current;
      if (frame?.contentWindow?.__scummwebRequestIntroSkip?.()) focusGameCanvas(frame);
      return;
    }
    bootState.dismissSkipIntroButton();

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
    if (!remoteMouseReady || remoteToolbarOpen || gameMenuOpen) return;
    let active = true;
    let stop;
    void isTvBrowser(navigator).then((isTv) => {
      if (active && isTv) stop = observeRemotePlayerInput(window, frameRef.current);
    });
    return () => { active = false; stop?.(); };
  }, [remoteMouseReady, remoteToolbarOpen, gameMenuOpen, frameSrc]);

  useEffect(() => {
    let active = true;
    let stop;
    void isTvBrowser(navigator).then((isTv) => {
      if (!active || !isTv) return;
      stop = observeRemoteBack(window, {
        onBack() {
          const dialog = shellRef.current?.querySelector("dialog:modal");
          if (dialog) {
            if (typeof dialog.requestClose === "function") dialog.requestClose();
            else dialog.close();
          }
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
    immersiveMode.canFullscreen && (!immersiveMode.isTouchMobile || !immersiveMode.isFullscreen) && bootState.hasBootPresentationCompleted;
  const showGameMenuButton =
    bootState.showGameMenuButton && !hasBootFailed && !waitingForLandscape;
  const keyboardAction = showCommandInput && !showCommandForm ? (
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
  const touchActions = keyboardAction && isZorkVoiceGame(currentReadySignal?.detectedGame ?? game ?? undefined) ? (
    <div aria-label="Game command controls" className="game-route-command-actions" role="group">
      <GameVoiceCommand enabled={!gameMenuOpen && !remoteToolbarOpen && !isExiting} frameRef={frameRef} shellRef={shellRef} key={frameSrc} />
      {keyboardAction}
    </div>
  ) : keyboardAction;
  const showBottomActions = showSkipIntroBottomAction || showTouchMouse || Boolean(touchActions);
  const bootStatusText = (graphicsRecovery ? GRAPHICS_LOST_MESSAGE : archiveError) || (loadArchive && !archivePrepared && !bootState.hasBootFailed
    ? gameLoadingStatus(archiveProgress ?? undefined)
    : bootState.bootStatusText);

  return (
    <div
      className="game-route-shell"
      data-mobile-orientation={immersiveMode.isTouchMobile && !isExiting ? "landscape" : undefined}
      onKeyDownCapture={(event) => {
        if (gameMenuOpen && event.key === "Escape" && event.repeat) event.preventDefault();
      }}
      ref={shellRef}
    >
      {!isExiting && <div className="mobile-orientation-message">
        <p role="status">Rotate your device to landscape to play.</p>
        {immersiveMode.canFullscreen && !immersiveMode.isFullscreen && (
          <button className="secondary-button" type="button" onClick={() => void enterImmersiveMode(document.documentElement)}>
            Enter fullscreen
          </button>
        )}
      </div>}
      <GameBootOverlay
        archiveBytes={!isExiting && loadArchive && !archivePrepared ? archiveProgress?.loaded : undefined}
        bootStatusText={isExiting ? "Exiting game…" : bootStatusText}
        game={game}
        hasBootFailed={!isExiting && hasBootFailed}
        graphicsRecovery={isExiting ? null : graphicsRecovery}
        onRestart={restartAfterGraphicsLoss}
        showBootOverlay={isExiting || showBootOverlay}
        showBundledTags={catalogLaunch}
        title={title}
      />
      {!isExiting && <GamePlayerControls
        backupDestinationKey={dropboxDestination}
        reportGame={{ ...game, source: catalogLaunch ? "catalog" : "local" }}
        autoHide={bootState.hasBootPresentationCompleted && !showBootOverlay && !immersiveMode.isMobileViewport && !remoteToolbarOpen && !gameMenuOpen}
        compatibilityWarnings={waitingForLandscape ? [] : compatibilityWarnings}
        frameRef={frameRef}
        gameMenuOpen={gameMenuOpen}
        gameMenuPage={gameMenuPage}
        menuShortcut={gameMenuShortcut}
        handleControlMouseDown={handleControlMouseDown}
        isFullscreen={immersiveMode.isFullscreen}
        isLaunching={showBootOverlay}
        onCloseMenu={closeGameMenu}
        onExit={handleExitClick}
        onNativeMenu={openNativeMenu}
        onOpenMenu={handleGameMenuClick}
        onResumeGame={resumeRemoteGame}
        onSkipIntro={handleSkipIntroClick}
        onToggleFullscreen={handleFullscreenToggle}
        showBottomActions={showBottomActions}
        showExitControl={showExitControl}
        showFullscreenControl={showFullscreenControl}
        showGameMenuButton={showGameMenuButton}
        showSkipIntroAction={showSkipIntroBottomAction}
        showTouchClickButtons={showTouchMouse}
        toolbarFocused={remoteToolbarOpen}
        title={game?.displayTitle ?? game?.title ?? title}
        touchActions={touchActions}
      />}
      {!isExiting && <GameTouchCursorPad
        frameRef={frameRef}
        indicatorOffset={touchCursorPad.indicatorOffset}
        onPointerCancel={touchCursorPad.handlePointerCancel}
        onPointerDown={touchCursorPad.handlePointerDown}
        onPointerMove={touchCursorPad.handlePointerMove}
        onPointerUp={touchCursorPad.handlePointerUp}
        onSelectMode={dungeonWalkLayout ? setDungeonTouchMode : undefined}
        showTouchCursorPad={showTouchMouse}
        showTouchWalk={showTouchWalk}
        walkLayout={dungeonWalkLayout}
      />}
      {showHugoStick ? (
        <div className="game-route-touch-gamepad" key={`hugo:${frameSrc}`}>
          <GameMovementStick frameRef={frameRef} hugo />
        </div>
      ) : null}
      {showTouchGamepad ? (
        <GameTouchGamepad frameRef={frameRef} mode={mobileControlMode} key={`${mobileControlMode}:${frameSrc}`} />
      ) : null}
      {showCommandInput ? (
        <form className="game-route-command" hidden={!showCommandForm} id="game-route-command" onSubmit={handleCommandSubmit}>
          <input
            aria-label="Game command"
            autoCapitalize="off"
            autoComplete="off"
            autoCorrect="off"
            enterKeyHint="enter"
            inputMode="text"
            maxLength={mobileControlMode === "hugo" ? 38 : 255}
            name="command"
            onBlur={() => setCommandOpen(false)}
            onKeyDown={handleCommandKeyDown}
            pattern="[ -~]*"
            placeholder="Type a command"
            readOnly={commandSending}
            ref={commandInputRef}
            spellCheck={false}
            title="Use letters, numbers, spaces, or basic punctuation."
            type="text"
          />
        </form>
      ) : null}
      {frameSrc && (!archiveError || archiveError === ARCHIVE_BOOT_TIMEOUT_MESSAGE) ? <iframe
        key={loadArchive ? frameSrc : undefined}
        allow="autoplay; fullscreen"
        className="game-route-frame"
        data-scummvm-route-frame="true"
        data-scummvm-target={target}
        inert={isExiting || Boolean(graphicsRecovery) || gameMenuOpen || remoteToolbarOpen || waitingForLandscape}
        ref={frameRef}
        loading="eager"
        src={loadArchive ? "about:blank" : frameSrc}
        srcDoc={archiveFrameDocument || undefined}
        title={title}
      /> : null}
    </div>
  );
}
