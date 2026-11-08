"use client";

import { useEffect, useRef, useState } from "react";

import { enterImmersiveMode, exitImmersiveMode, isGameFullscreen, isMobileClient, isTouchMobileClient, resumeMobileGameLaunch, unlockOrientation } from "./immersive-mode.mjs";

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

  if (typeof window.matchMedia === "function") {
    return window.matchMedia(LANDSCAPE_QUERY).matches;
  }

  return window.innerWidth >= window.innerHeight;
}

export function useImmersiveMode({ shellRef }) {
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [canFullscreen, setCanFullscreen] = useState(false);
  const [isMobileViewport, setIsMobileViewport] = useState(false);
  const [isLandscapeViewport, setIsLandscapeViewport] = useState(true);
  const autoImmersiveAttemptedRef = useRef(false);
  const mountedRef = useRef(false);

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
      const fullscreenActive = isGameFullscreen(shell);

      setIsFullscreen(fullscreenActive);

      if (!fullscreenActive) unlockOrientation();
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
    if (!isTouchMobileClient() || !canFullscreen || autoImmersiveAttemptedRef.current) {
      return;
    }

    autoImmersiveAttemptedRef.current = true;
    void resumeMobileGameLaunch(shellRef.current);
  }, [canFullscreen, isMobileViewport, shellRef]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      // Strict Mode reattaches effects before this microtask runs.
      queueMicrotask(() => {
        if (!mountedRef.current) void exitImmersiveMode();
      });
    };
  }, []);

  async function handleFullscreenToggle() {
    const shell = shellRef.current;

    if (!shell) {
      return;
    }

    try {
      if (isGameFullscreen(shell)) {
        await exitImmersiveMode();
        return;
      }

      await enterImmersiveMode(isTouchMobileClient() ? document.documentElement : shell);
    } catch (error) {
      console.error("Failed to toggle fullscreen mode.", error);
    }
  }

  return {
    canFullscreen,
    exitImmersiveMode,
    handleFullscreenToggle,
    isFullscreen,
    isLandscapeViewport,
    isMobileViewport,
  };
}
