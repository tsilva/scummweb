"use client";

import { useEffect, useState } from "react";
import { clickGameMouse } from "./game-mouse.mjs";

export function useTouchClickActions({ frameRef, skipIntro, skipIntroConsumed }) {
  const [touchControlsUnlocked, setTouchControlsUnlocked] = useState(() => !skipIntro);

  function sendTouchClick(button) {
    clickGameMouse(frameRef.current, window.location.origin, button);
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
