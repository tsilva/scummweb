"use client";

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

export function useImmersiveMode({ shellRef }) {
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [canFullscreen, setCanFullscreen] = useState(false);
  const [isMobileViewport, setIsMobileViewport] = useState(false);
  const [isLandscapeViewport, setIsLandscapeViewport] = useState(true);
  const [needsImmersiveRetry, setNeedsImmersiveRetry] = useState(false);
  const autoImmersiveAttemptedRef = useRef(false);
  const immersiveRetryInFlightRef = useRef(false);

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
  }, [shellRef]);

  useEffect(() => {
    if (!isMobileViewport || !canFullscreen || autoImmersiveAttemptedRef.current) {
      return;
    }

    autoImmersiveAttemptedRef.current = true;
    let cancelled = false;

    async function attemptAutoImmersiveMode() {
      const entered = await enterImmersiveMode({ shellRef, silenceErrors: true });

      if (!cancelled && !entered) {
        setNeedsImmersiveRetry(true);
      }
    }

    void attemptAutoImmersiveMode();

    return () => {
      cancelled = true;
    };
  }, [canFullscreen, isMobileViewport, shellRef]);

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
        const entered = await enterImmersiveMode({ shellRef, silenceErrors: true });

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
  }, [isMobileViewport, needsImmersiveRetry, shellRef]);

  useEffect(() => {
    return () => {
      const orientationApi = getOrientationApi();

      try {
        orientationApi?.unlock?.();
      } catch {}
    };
  }, []);

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

      await enterImmersiveMode({ shellRef });
    } catch (error) {
      console.error("Failed to toggle fullscreen mode.", error);
    }
  }

  async function handleImmersiveResume() {
    const entered = await enterImmersiveMode({ shellRef });

    if (entered) {
      setNeedsImmersiveRetry(false);
    }
  }

  return {
    canFullscreen,
    exitImmersiveMode,
    handleFullscreenToggle,
    handleImmersiveResume,
    isFullscreen,
    isLandscapeViewport,
    isMobileViewport,
    needsImmersiveRetry,
  };
}

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

async function enterImmersiveMode({ shellRef, silenceErrors = false } = {}) {
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
