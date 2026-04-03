"use client";

import { LogOut, Maximize, Minimize } from "lucide-react";
import { useEffect, useRef, useState } from "react";

const MOBILE_BREAKPOINT_QUERY = "(max-width: 900px)";
const MOBILE_POINTER_QUERY = "(pointer: coarse)";
const LANDSCAPE_QUERY = "(orientation: landscape)";

function addMediaQueryListener(query, listener) {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return () => {};
  }

  const mediaQuery = window.matchMedia(query);

  if (typeof mediaQuery.addEventListener === "function") {
    mediaQuery.addEventListener("change", listener);

    return () => {
      mediaQuery.removeEventListener("change", listener);
    };
  }

  mediaQuery.addListener(listener);

  return () => {
    mediaQuery.removeListener(listener);
  };
}

function isMobileClient() {
  if (typeof window === "undefined") {
    return false;
  }

  const coarsePointer =
    typeof window.matchMedia === "function" && window.matchMedia(MOBILE_POINTER_QUERY).matches;
  const compactViewport =
    typeof window.matchMedia === "function" && window.matchMedia(MOBILE_BREAKPOINT_QUERY).matches;

  return coarsePointer || compactViewport || navigator.maxTouchPoints > 0;
}

function getOrientationApi() {
  if (typeof screen === "undefined") {
    return null;
  }

  return screen.orientation || null;
}

function isLandscapeClient() {
  if (typeof window === "undefined") {
    return true;
  }

  const orientationApi = getOrientationApi();

  if (typeof orientationApi?.type === "string") {
    return orientationApi.type.startsWith("landscape");
  }

  if (typeof window.matchMedia === "function") {
    return window.matchMedia(LANDSCAPE_QUERY).matches;
  }

  return window.innerWidth >= window.innerHeight;
}

function isShellFullscreen(shell) {
  if (!shell || typeof document === "undefined") {
    return false;
  }

  return document.fullscreenElement === shell || document.webkitFullscreenElement === shell;
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

export default function GameRouteFrame({ src, target, title }) {
  const shellRef = useRef(null);
  const frameRef = useRef(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [canFullscreen, setCanFullscreen] = useState(false);
  const [exitHref, setExitHref] = useState("/");
  const [isMobileViewport, setIsMobileViewport] = useState(false);
  const [isLandscapeViewport, setIsLandscapeViewport] = useState(true);
  const [needsImmersiveRetry, setNeedsImmersiveRetry] = useState(false);
  const autoImmersiveAttemptedRef = useRef(false);
  const immersiveRetryInFlightRef = useRef(false);

  useEffect(() => {
    function navigateHome(href = "/") {
      window.location.replace(getSafeHref(href));
    }

    function handleMessage(event) {
      if (event.origin !== window.location.origin || event.data?.type !== "scummvm-exit") {
        return;
      }

      navigateHome(event.data.href || "/");
    }

    window.addEventListener("message", handleMessage);

    return () => {
      window.removeEventListener("message", handleMessage);
    };
  }, []);

  useEffect(() => {
    setExitHref(getExitHrefFromSrc(src));
  }, [src]);

  useEffect(() => {
    function syncViewportState() {
      setIsMobileViewport(isMobileClient());
      setIsLandscapeViewport(isLandscapeClient());
    }

    syncViewportState();

    const removeBreakpointListener = addMediaQueryListener(MOBILE_BREAKPOINT_QUERY, syncViewportState);
    const removePointerListener = addMediaQueryListener(MOBILE_POINTER_QUERY, syncViewportState);
    const removeLandscapeListener = addMediaQueryListener(LANDSCAPE_QUERY, syncViewportState);
    const orientationApi = getOrientationApi();

    window.addEventListener("resize", syncViewportState);
    window.addEventListener("orientationchange", syncViewportState);
    orientationApi?.addEventListener?.("change", syncViewportState);

    return () => {
      removeBreakpointListener();
      removePointerListener();
      removeLandscapeListener();
      window.removeEventListener("resize", syncViewportState);
      window.removeEventListener("orientationchange", syncViewportState);
      orientationApi?.removeEventListener?.("change", syncViewportState);
    };
  }, []);

  useEffect(() => {
    let focusTimer = 0;
    let attempts = 0;
    const iframe = frameRef.current;

    if (!iframe) {
      return;
    }

    function focusGameCanvas() {
      const frame = frameRef.current;

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

    function scheduleFocusAttempt() {
      if (focusTimer) {
        return;
      }

      const runAttempt = () => {
        attempts += 1;
        focusTimer = 0;

        if (focusGameCanvas() || attempts >= 40) {
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
  }, [src]);

  useEffect(() => {
    function syncFullscreenState() {
      const shell = shellRef.current;
      const fullscreenActive = isShellFullscreen(shell);

      setIsFullscreen(fullscreenActive);

      if (!fullscreenActive) {
        const orientationApi = getOrientationApi();

        try {
          orientationApi?.unlock?.();
        } catch {}
      }
    }

    const shell = shellRef.current;
    const supportsFullscreen = Boolean(
      shell &&
        (shell.requestFullscreen || shell.webkitRequestFullscreen) &&
        (document.exitFullscreen || document.webkitExitFullscreen),
    );

    setCanFullscreen(supportsFullscreen);
    syncFullscreenState();

    document.addEventListener("fullscreenchange", syncFullscreenState);
    document.addEventListener("webkitfullscreenchange", syncFullscreenState);

    return () => {
      document.removeEventListener("fullscreenchange", syncFullscreenState);
      document.removeEventListener("webkitfullscreenchange", syncFullscreenState);
    };
  }, []);

  useEffect(() => {
    if (!isMobileViewport || !canFullscreen || autoImmersiveAttemptedRef.current) {
      return;
    }

    autoImmersiveAttemptedRef.current = true;
    let cancelled = false;

    async function attemptAutoImmersiveMode() {
      const entered = await enterImmersiveMode({ silenceErrors: true });

      if (!cancelled && !entered) {
        setNeedsImmersiveRetry(true);
      }
    }

    void attemptAutoImmersiveMode();

    return () => {
      cancelled = true;
    };
  }, [canFullscreen, isMobileViewport]);

  useEffect(() => {
    if (!isMobileViewport || !needsImmersiveRetry) {
      return;
    }

    async function retryImmersiveMode() {
      if (immersiveRetryInFlightRef.current) {
        return;
      }

      immersiveRetryInFlightRef.current = true;

      try {
        const entered = await enterImmersiveMode({ silenceErrors: true });

        if (entered) {
          setNeedsImmersiveRetry(false);
        }
      } finally {
        immersiveRetryInFlightRef.current = false;
      }
    }

    function handleRetryKeydown(event) {
      if (event.metaKey || event.ctrlKey || event.altKey) {
        return;
      }

      void retryImmersiveMode();
    }

    window.addEventListener("pointerup", retryImmersiveMode, { passive: true });
    window.addEventListener("touchend", retryImmersiveMode, { passive: true });
    window.addEventListener("keydown", handleRetryKeydown);

    return () => {
      window.removeEventListener("pointerup", retryImmersiveMode);
      window.removeEventListener("touchend", retryImmersiveMode);
      window.removeEventListener("keydown", handleRetryKeydown);
    };
  }, [isMobileViewport, needsImmersiveRetry]);

  useEffect(() => {
    return () => {
      const orientationApi = getOrientationApi();

      try {
        orientationApi?.unlock?.();
      } catch {}
    };
  }, []);

  async function lockLandscapeOrientation({ silenceErrors = false } = {}) {
    const orientationApi = getOrientationApi();

    if (typeof orientationApi?.lock !== "function") {
      return false;
    }

    try {
      await orientationApi.lock("landscape");
      return true;
    } catch (error) {
      if (!silenceErrors) {
        console.error("Failed to lock landscape orientation.", error);
      }

      return false;
    }
  }

  async function enterImmersiveMode({ silenceErrors = false } = {}) {
    const shell = shellRef.current;

    if (!shell) {
      return false;
    }

    try {
      if (!isShellFullscreen(shell)) {
        if (shell.requestFullscreen) {
          await shell.requestFullscreen();
        } else if (shell.webkitRequestFullscreen) {
          await shell.webkitRequestFullscreen();
        } else {
          return false;
        }
      }

      if (isMobileClient()) {
        await lockLandscapeOrientation({ silenceErrors });
      }

      return isShellFullscreen(shell);
    } catch (error) {
      if (!silenceErrors) {
        console.error("Failed to enter immersive mode.", error);
      }

      return false;
    }
  }

  async function exitImmersiveMode({ silenceErrors = false } = {}) {
    const orientationApi = getOrientationApi();

    try {
      orientationApi?.unlock?.();
    } catch (error) {
      if (!silenceErrors) {
        console.error("Failed to unlock screen orientation.", error);
      }
    }

    try {
      if (document.exitFullscreen) {
        await document.exitFullscreen();
      } else if (document.webkitExitFullscreen) {
        await document.webkitExitFullscreen();
      }
    } catch (error) {
      if (!silenceErrors) {
        console.error("Failed to exit fullscreen mode.", error);
      }
    }
  }

  async function handleFullscreenToggle() {
    const shell = shellRef.current;

    if (!shell) {
      return;
    }

    try {
      if (isShellFullscreen(shell)) {
        await exitImmersiveMode();

        return;
      }

      await enterImmersiveMode();
    } catch (error) {
      console.error("Failed to toggle fullscreen mode.", error);
    }
  }

  async function handleExitClick() {
    const shell = shellRef.current;

    if (shell) {
      try {
        if (isShellFullscreen(shell)) {
          await exitImmersiveMode({ silenceErrors: true });
        }
      } catch (error) {
        console.error("Failed to exit fullscreen mode before leaving the game.", error);
      }
    }

    window.location.replace(exitHref);
  }

  async function handleImmersiveResume() {
    const entered = await enterImmersiveMode();

    if (entered) {
      setNeedsImmersiveRetry(false);
    }
  }

  const FullscreenIcon = isFullscreen ? Minimize : Maximize;
  const fullscreenLabel = isFullscreen ? "Exit fullscreen" : "Enter fullscreen";
  const showMobileOverlay = isMobileViewport && (needsImmersiveRetry || !isLandscapeViewport);
  const mobileOverlayTitle = needsImmersiveRetry ? "Tap to continue" : "Rotate to landscape";
  const mobileOverlayBody = needsImmersiveRetry
    ? "Your browser needs one tap before scummweb can enter fullscreen on mobile."
    : "scummweb plays in landscape on mobile. Rotate your device to keep the game visible.";

  return (
    <div className="game-route-shell" ref={shellRef}>
      {showMobileOverlay ? (
        <div className="game-route-mobile-overlay" role="status" aria-live="polite">
          <div className="game-route-mobile-card">
            <p className="game-route-mobile-title">{mobileOverlayTitle}</p>
            <p className="game-route-mobile-copy">{mobileOverlayBody}</p>
            {needsImmersiveRetry ? (
              <button
                className="game-route-mobile-button"
                onClick={() => {
                  void handleImmersiveResume();
                }}
                type="button"
              >
                Continue
              </button>
            ) : null}
          </div>
        </div>
      ) : null}
      <div className="game-route-controls">
        {canFullscreen ? (
          <button
            aria-label={fullscreenLabel}
            className="game-route-control-button"
            onClick={handleFullscreenToggle}
            title={fullscreenLabel}
            type="button"
          >
            <FullscreenIcon aria-hidden="true" size={18} strokeWidth={2} />
          </button>
        ) : null}
        <button
          aria-label="Exit game"
          className="game-route-control-button"
          onClick={handleExitClick}
          title="Exit game"
          type="button"
        >
          <LogOut aria-hidden="true" size={17} strokeWidth={2} />
        </button>
      </div>
      <iframe
        allow="autoplay; fullscreen"
        className="game-route-frame"
        data-scummvm-route-frame="true"
        data-scummvm-target={target}
        ref={frameRef}
        loading="eager"
        src={src}
        title={title}
      />
    </div>
  );
}
