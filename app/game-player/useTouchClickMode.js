"use client";

import { useEffect, useState } from "react";

const TOUCH_CLICK_MODE_STORAGE_KEY = "scummweb.touchClickMode";

export function normalizeTouchClickMode(value) {
  return value === "right" ? "right" : "left";
}

export function useTouchClickMode({ frameRef, frameSrc, skipIntro, skipIntroConsumed }) {
  const [touchControlsUnlocked, setTouchControlsUnlocked] = useState(() => !skipIntro);
  const [touchClickMode, setTouchClickMode] = useState(() => {
    if (typeof window === "undefined") {
      return "left";
    }

    try {
      return normalizeTouchClickMode(window.localStorage.getItem(TOUCH_CLICK_MODE_STORAGE_KEY));
    } catch {
      return "left";
    }
  });

  function syncTouchClickModeToFrame(nextMode) {
    const frameWindow = frameRef.current?.contentWindow;

    if (!frameWindow) {
      return;
    }

    try {
      frameWindow.postMessage(
        {
          type: "scummweb-touch-click-mode",
          mode: normalizeTouchClickMode(nextMode),
        },
        window.location.origin,
      );
    } catch {}
  }

  useEffect(() => {
    setTouchControlsUnlocked(!skipIntro || skipIntroConsumed);
  }, [frameSrc, skipIntro, skipIntroConsumed]);

  useEffect(() => {
    try {
      window.localStorage.setItem(TOUCH_CLICK_MODE_STORAGE_KEY, touchClickMode);
    } catch {}

    const iframe = frameRef.current;

    if (!iframe) {
      return;
    }

    const syncMode = () => {
      syncTouchClickModeToFrame(touchClickMode);
    };

    syncMode();
    iframe.addEventListener("load", syncMode);

    return () => {
      iframe.removeEventListener("load", syncMode);
    };
  }, [frameRef, frameSrc, touchClickMode]);

  function toggleTouchClickMode() {
    const nextMode = touchClickMode === "left" ? "right" : "left";
    setTouchClickMode(nextMode);
    syncTouchClickModeToFrame(nextMode);
  }

  function unlockTouchControls() {
    setTouchControlsUnlocked(true);
  }

  return {
    touchClickMode,
    touchControlsUnlocked,
    toggleTouchClickMode,
    unlockTouchControls,
  };
}
