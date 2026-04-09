"use client";

import { useEffect, useState } from "react";

const TOUCH_CLICK_MESSAGE_TYPE = "scummweb-touch-click";

export function normalizeTouchClickButton(value) {
  return value === "right" ? "right" : "left";
}

export function useTouchClickActions({ frameRef, skipIntro, skipIntroConsumed }) {
  const [touchControlsUnlocked, setTouchControlsUnlocked] = useState(() => !skipIntro);

  function sendTouchClick(button) {
    const frameWindow = frameRef.current?.contentWindow;

    if (!frameWindow) {
      return;
    }

    try {
      frameWindow.postMessage(
        {
          type: TOUCH_CLICK_MESSAGE_TYPE,
          button: normalizeTouchClickButton(button),
        },
        window.location.origin,
      );
    } catch {}
  }

  useEffect(() => {
    setTouchControlsUnlocked(!skipIntro || skipIntroConsumed);
  }, [skipIntro, skipIntroConsumed]);

  function unlockTouchControls() {
    setTouchControlsUnlocked(true);
  }

  return {
    sendTouchClick,
    touchControlsUnlocked,
    unlockTouchControls,
  };
}
