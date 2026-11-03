"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { scummvmAssetVersion } from "./asset-paths";
import { getLatestBrowserSave } from "./browser-saves.mjs";
import GameBootOverlay from "./game-player/GameBootOverlay";
import GameMobileOverlay from "./game-player/GameMobileOverlay";
import GamePlayerControls from "./game-player/GamePlayerControls";
import GameTouchCursorPad from "./game-player/GameTouchCursorPad";
import { createGameLaunchAnalytics } from "./game-player/game-launch-analytics.mjs";
import { dispatchSyntheticKeypressSequence } from "./game-player/keyboard";
import { useBootState } from "./game-player/useBootState";
import { useImmersiveMode } from "./game-player/useImmersiveMode";
import { useTouchClickActions } from "./game-player/useTouchClickMode";
import { useTouchCursorPad } from "./game-player/useTouchCursorPad";
import { sendZipGameFiles } from "./home-shell/zip-game-player";
import { recordRecentGameTarget } from "./recent-games";

const SCUMMWEB_FRAME_MESSAGE_SOURCE = "scummweb";
const SCUMMWEB_ASPECT_RATIO_MESSAGE_TYPE = "scummweb-aspect-ratio";
const ARCHIVE_FRAME_NAVIGATION_TIMEOUT_MS = 8000;

function shouldHideScummvmMenuButton(game, target) {
  return (
    game?.engineId === "drascula" ||
    game?.engineId === "dreamweb" ||
    game?.gameId === "drascula" ||
    game?.gameId === "dreamweb" ||
    game?.gameId === "nippon" ||
    game?.gameId === "sword25" ||
    target === "drascula" ||
    target === "dreamweb-cd" ||
    target === "nippon-amiga" ||
    target === "sword25"
  );
}

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

export default function GameRouteFrame({ game = null, src, target, title, skipIntro: intro = null, loadArchive }) {
  const shellRef = useRef(null);
  const frameRef = useRef(null);
  const archiveFiles = useRef(null);
  const [archiveError, setArchiveError] = useState("");
  const [launchAnalytics] = useState(() => createGameLaunchAnalytics(loadArchive ? null : game?.slug));
  const [frameSrc, setFrameSrc] = useState(null);
  const [isResuming, setIsResuming] = useState(false);
  const [exitHref, setExitHref] = useState("/");
  const [isFillScreenAspect, setIsFillScreenAspect] = useState(false);
  const [readySignal, setReadySignal] = useState(null);
  const [skipIntroConsumed, setSkipIntroConsumed] = useState(false);
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
  const touchClick = useTouchClickActions({
    frameRef,
    skipIntro,
    skipIntroConsumed,
  });
  const hasBootFailed = Boolean(archiveError) || bootState.hasBootFailed;
  const showBootOverlay = !bootState.hasBootCompleted || hasBootFailed;
  const hasBootOverlayDismissed = !showBootOverlay;
  const showMobileOverlay =
    hasBootOverlayDismissed &&
    immersiveMode.isMobileViewport &&
    (immersiveMode.needsImmersiveRetry || !immersiveMode.isLandscapeViewport);
  const mobileControlsReady =
    immersiveMode.isMobileViewport &&
    bootState.hasBootCompleted &&
    !hasBootFailed &&
    !showMobileOverlay;
  const touchCursorPad = useTouchCursorPad({
    enabled: mobileControlsReady && immersiveMode.isLandscapeViewport,
    frameRef,
  });

  useLayoutEffect(() => {
    const navigationTimer = loadArchive && frameSrc === src ? window.setTimeout(() => {
      const iframe = frameRef.current;
      const documentUrl = iframe?.contentDocument?.URL;
      if (!iframe || !archiveFiles.current || (documentUrl && documentUrl !== "about:blank")) return;

      // Leave an active ScummVM startup alone. Only retry a frame whose document
      // never loaded, while we still own the ZIP's unpacked files.
      const retryUrl = new URL(src, window.location.href);
      retryUrl.searchParams.set("launchRetry", "1");
      setFrameSrc(`${retryUrl.pathname}${retryUrl.search}${retryUrl.hash}`);
    }, ARCHIVE_FRAME_NAVIGATION_TIMEOUT_MS) : null;

    const archiveBootTimer = loadArchive && frameSrc ? window.setTimeout(() => {
      archiveFiles.current = null;
      setArchiveError("ScummVM took too long to start. Reload this page to try again.");
    }, 90000) : null;

    function navigateHome(href = "/") {
      window.location.replace(getSafeHref(href));
    }

    function handleMessage(event) {
      if (event.origin !== window.location.origin) {
        return;
      }

      if (loadArchive && event.source === frameRef.current?.contentWindow) {
        if (event.data?.type === "scummweb:local-game-ready" && archiveFiles.current) {
          sendZipGameFiles(event.source, archiveFiles.current);
          archiveFiles.current = null;
          return;
        }

        if (event.data?.type === "scummweb:local-game-status") {
          window.clearTimeout(archiveBootTimer);
          if (event.data.status === "running") {
            setReadySignal({ reason: "archive-running" });
          } else {
            setArchiveError(event.data.status === "undetected"
              ? "ScummVM could not detect a supported game in this ZIP."
              : "ScummVM could not start this game. Reload this page to try again.");
          }
          return;
        }
      }

      if (event.data?.type === "scummvm-ready") {
        const iframeWindow = frameRef.current?.contentWindow;
        const expectedFrameHref = getNormalizedFrameHref(frameRef.current?.src || frameSrc);
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

        setReadySignal({
          href: messageFrameHref,
          reason: event.data?.reason || null,
          reportedAt: event.data?.emittedAt || null,
        });

        if (event.data.reason === "rendered-frame-detected") {
          launchAnalytics.confirm();
        } else if (event.data.reason === "rendered-frame-timeout") {
          launchAnalytics.fail("first_frame_timeout");
        }
        return;
      }

      if (event.data?.type !== "scummvm-exit") {
        return;
      }

      if (
        event.source === frameRef.current?.contentWindow &&
        Number.isFinite(event.data.status) && event.data.status !== 0
      ) {
        launchAnalytics.fail("startup_error");
      }
      navigateHome(event.data.href || "/");
    }

    window.addEventListener("message", handleMessage);

    return () => {
      window.clearTimeout(navigationTimer);
      window.clearTimeout(archiveBootTimer);
      window.removeEventListener("message", handleMessage);
    };
  }, [frameSrc, launchAnalytics, loadArchive, src, target]);

  useEffect(() => {
    const controller = new AbortController();
    setReadySignal(null);
    setSkipIntroConsumed(false);

    async function openGame() {
      if (loadArchive) {
        try {
          const files = await loadArchive(controller.signal);
          if (controller.signal.aborted) return;
          archiveFiles.current = files;
          setFrameSrc(src);
        } catch (error) {
          if (!controller.signal.aborted) setArchiveError(error.message);
        }
        return;
      }

      launchAnalytics.start();
      const slot = window.location.hash === "#continue"
        ? await getLatestBrowserSave(game, scummvmAssetVersion)
        : null;
      if (controller.signal.aborted) return;

      setIsResuming(slot !== null);
      setFrameSrc(slot === null ? src : buildSaveSlotSrc(src, target, slot));
    }

    void openGame();
    return () => { controller.abort(); };
  }, [game, launchAnalytics, loadArchive, src, target]);

  useEffect(() => {
    if (bootState.hasBootFailed) launchAnalytics.fail("startup_error");
  }, [bootState.hasBootFailed, launchAnalytics]);

  const canCountPlayTime =
    readySignal?.reason === "rendered-frame-detected" && !showBootOverlay && !showMobileOverlay;

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
            mode: isFillScreenAspect ? "fill" : "preserve",
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
  }, [frameSrc, isFillScreenAspect]);

  useEffect(() => {
    setExitHref(getExitHrefFromSrc(frameSrc || src));
  }, [frameSrc, src]);

  useEffect(() => {
    if (!loadArchive) recordRecentGameTarget(target);
  }, [loadArchive, target]);

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

  async function handleExitClick() {
    if (shellRef.current) {
      try {
        await immersiveMode.exitImmersiveMode({ silenceErrors: true });
      } catch (error) {
        console.error("Failed to exit fullscreen mode before leaving the game.", error);
      }
    }

    window.location.replace(exitHref);
  }

  function handleControlMouseDown(event) {
    event.preventDefault();
  }

  async function handleScummvmMenuClick() {
    await dispatchSyntheticKeypressSequence(frameRef.current, {
      key: "F5",
      code: "F5",
      keyCode: 116,
      ctrlKey: true,
    });
  }

  function handleSkipIntroClick() {
    dismissSkipIntroButton();

    if (!skipIntro) {
      return;
    }

    setReadySignal(null);
    setSkipIntroConsumed(true);
    setFrameSrc((currentSrc) => buildSaveSlotSrc(currentSrc, target, skipIntro.slot, { seedIntro: true }));
  }

  function handleAspectRatioToggle() {
    setIsFillScreenAspect((currentValue) => !currentValue);
  }

  const showBootProgress =
    typeof bootState.bootProgressValue === "number" &&
    Number.isFinite(bootState.bootProgressValue) &&
    typeof bootState.bootProgressMax === "number" &&
    Number.isFinite(bootState.bootProgressMax) &&
    bootState.bootProgressMax > 0;
  const bootProgressPercent = showBootProgress
    ? Math.max(
        0,
        Math.min(100, Math.round((bootState.bootProgressValue / bootState.bootProgressMax) * 100)),
      )
    : null;
  const showSkipIntroAction = bootState.showSkipIntroButton && skipIntro && !bootState.hasBootFailed;
  const showSkipIntroOverlayAction = showSkipIntroAction && showBootOverlay;
  const showSkipIntroBottomAction = showSkipIntroAction && !showBootOverlay;
  const showExitControl =
    !skipIntro ||
    bootState.hasBootFailed ||
    showSkipIntroAction ||
    touchClick.touchControlsUnlocked ||
    skipIntroConsumed;
  const showFullscreenControl =
    immersiveMode.canFullscreen && bootState.hasBootPresentationCompleted;
  const showAspectRatioControl =
    immersiveMode.isMobileViewport && bootState.hasBootPresentationCompleted;
  const showScummvmMenuButton =
    bootState.showScummvmMenuButton && !shouldHideScummvmMenuButton(game, target);
  const showTouchClickButtons = mobileControlsReady;
  const showTouchCursorPad = mobileControlsReady;
  const showBottomActions = showSkipIntroBottomAction || showTouchClickButtons;

  return (
    <div className="game-route-shell" ref={shellRef}>
      <GameBootOverlay
        bootProgressPercent={bootProgressPercent}
        bootStatusText={archiveError || (loadArchive && !frameSrc ? "Downloading game ZIP…" : bootState.bootStatusText)}
        game={game}
        hasBootFailed={hasBootFailed}
        onSkipIntro={handleSkipIntroClick}
        showSkipIntroAction={showSkipIntroOverlayAction}
        showBootOverlay={showBootOverlay}
        showBootProgress={showBootProgress}
        title={title}
      />
      <GameMobileOverlay
        needsImmersiveRetry={immersiveMode.needsImmersiveRetry}
        onContinue={immersiveMode.handleImmersiveResume}
        showMobileOverlay={showMobileOverlay}
      />
      <GamePlayerControls
        handleControlMouseDown={handleControlMouseDown}
        isFillScreenAspect={isFillScreenAspect}
        isFullscreen={immersiveMode.isFullscreen}
        onExit={handleExitClick}
        onOpenMenu={handleScummvmMenuClick}
        onSkipIntro={handleSkipIntroClick}
        onToggleAspectRatio={handleAspectRatioToggle}
        onTouchLeftClick={() => touchClick.sendTouchClick("left")}
        onTouchRightClick={() => touchClick.sendTouchClick("right")}
        onToggleFullscreen={immersiveMode.handleFullscreenToggle}
        showBottomActions={showBottomActions}
        showAspectRatioControl={showAspectRatioControl}
        showExitControl={showExitControl}
        showFullscreenControl={showFullscreenControl}
        showScummvmMenuButton={showScummvmMenuButton}
        showSkipIntroAction={showSkipIntroBottomAction}
        showTouchClickButtons={showTouchClickButtons}
      />
      <GameTouchCursorPad
        indicatorOffset={touchCursorPad.indicatorOffset}
        onPointerCancel={touchCursorPad.handlePointerCancel}
        onPointerDown={touchCursorPad.handlePointerDown}
        onPointerMove={touchCursorPad.handlePointerMove}
        onPointerUp={touchCursorPad.handlePointerUp}
        showTouchCursorPad={showTouchCursorPad}
      />
      {frameSrc ? <iframe
        key={loadArchive ? frameSrc : undefined}
        allow="autoplay; fullscreen"
        className="game-route-frame"
        data-scummvm-route-frame="true"
        data-scummvm-target={target}
        ref={frameRef}
        loading="eager"
        src={frameSrc}
        title={title}
      /> : null}
    </div>
  );
}
