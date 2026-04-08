"use client";

import { useEffect, useRef, useState } from "react";
import GameBootOverlay from "./game-player/GameBootOverlay";
import GameMobileOverlay from "./game-player/GameMobileOverlay";
import GamePlayerControls from "./game-player/GamePlayerControls";
import { dispatchSyntheticKeypressSequence } from "./game-player/keyboard";
import { useBootState } from "./game-player/useBootState";
import { useImmersiveMode } from "./game-player/useImmersiveMode";
import { useTouchClickMode } from "./game-player/useTouchClickMode";
import { recordRecentGameTarget } from "./recent-games";

const SCUMMWEB_FRAME_MESSAGE_SOURCE = "scummweb";

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

function buildSkipIntroSaveSlotSrc(src, target, slot) {
  if (typeof window === "undefined") {
    return src;
  }

  try {
    const resolvedUrl = new URL(src, window.location.href);
    resolvedUrl.searchParams.set("skipIntroTarget", target);
    resolvedUrl.hash = ["-x", String(slot), target].join(" ");
    return `${resolvedUrl.pathname}${resolvedUrl.search}${resolvedUrl.hash}`;
  } catch {
    return src;
  }
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

export default function GameRouteFrame({ game = null, src, target, title, skipIntro = null }) {
  const shellRef = useRef(null);
  const frameRef = useRef(null);
  const [frameSrc, setFrameSrc] = useState(src);
  const [exitHref, setExitHref] = useState("/");
  const [readySignal, setReadySignal] = useState(null);
  const [skipIntroConsumed, setSkipIntroConsumed] = useState(false);
  const bootState = useBootState({
    frameRef,
    frameSrc,
    readySignal,
    skipIntro,
    skipIntroConsumed,
  });
  const immersiveMode = useImmersiveMode({ shellRef });
  const touchClickMode = useTouchClickMode({
    frameRef,
    frameSrc,
    skipIntro,
    skipIntroConsumed,
  });

  useEffect(() => {
    function navigateHome(href = "/") {
      window.location.replace(getSafeHref(href));
    }

    function handleMessage(event) {
      if (event.origin !== window.location.origin) {
        return;
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
        return;
      }

      if (event.data?.type !== "scummvm-exit") {
        return;
      }

      navigateHome(event.data.href || "/");
    }

    window.addEventListener("message", handleMessage);

    return () => {
      window.removeEventListener("message", handleMessage);
    };
  }, [frameSrc, target]);

  useEffect(() => {
    setFrameSrc(src);
    setReadySignal(null);
    setSkipIntroConsumed(false);
  }, [src]);

  useEffect(() => {
    setExitHref(getExitHrefFromSrc(frameSrc));
  }, [frameSrc]);

  useEffect(() => {
    recordRecentGameTarget(target);
  }, [target]);

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
    touchClickMode.unlockTouchControls();
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
    setFrameSrc((currentSrc) => buildSkipIntroSaveSlotSrc(currentSrc, target, skipIntro.slot));
  }

  const showBootOverlay = !bootState.hasBootCompleted || bootState.hasBootFailed;
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
  const hasBootOverlayDismissed = !showBootOverlay;
  const showMobileOverlay =
    hasBootOverlayDismissed &&
    immersiveMode.isMobileViewport &&
    (immersiveMode.needsImmersiveRetry || !immersiveMode.isLandscapeViewport);
  const showSkipIntroAction =
    bootState.showSkipIntroButton && skipIntro && bootState.hasBootCompleted && !bootState.hasBootFailed;
  const showExitControl =
    !skipIntro ||
    bootState.hasBootFailed ||
    showSkipIntroAction ||
    touchClickMode.touchControlsUnlocked ||
    skipIntroConsumed;
  const showFullscreenControl =
    immersiveMode.canFullscreen && bootState.hasBootPresentationCompleted;
  const showTouchClickToggle =
    immersiveMode.isMobileViewport &&
    bootState.hasBootCompleted &&
    !bootState.hasBootFailed &&
    !showMobileOverlay &&
    touchClickMode.touchControlsUnlocked;
  const showBottomActions = showSkipIntroAction;

  return (
    <div className="game-route-shell" ref={shellRef}>
      <GameBootOverlay
        bootProgressPercent={bootProgressPercent}
        bootStatusText={bootState.bootStatusText}
        game={game}
        hasBootFailed={bootState.hasBootFailed}
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
        isFullscreen={immersiveMode.isFullscreen}
        onExit={handleExitClick}
        onOpenMenu={handleScummvmMenuClick}
        onSkipIntro={handleSkipIntroClick}
        onToggleFullscreen={immersiveMode.handleFullscreenToggle}
        onToggleTouchClickMode={touchClickMode.toggleTouchClickMode}
        showBottomActions={showBottomActions}
        showExitControl={showExitControl}
        showFullscreenControl={showFullscreenControl}
        showScummvmMenuButton={bootState.showScummvmMenuButton}
        showSkipIntroAction={showSkipIntroAction}
        showTouchClickToggle={showTouchClickToggle}
        touchClickMode={touchClickMode.touchClickMode}
      />
      <iframe
        allow="autoplay; fullscreen"
        className="game-route-frame"
        data-scummvm-route-frame="true"
        data-scummvm-target={target}
        ref={frameRef}
        loading="eager"
        src={frameSrc}
        title={title}
      />
    </div>
  );
}
