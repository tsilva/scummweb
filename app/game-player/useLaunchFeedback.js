"use client";

import { useEffect, useState } from "react";
import { createPortal, flushSync } from "react-dom";
import GameBootOverlay from "./GameBootOverlay";

export default function useLaunchFeedback({ showBundledTags = true } = {}) {
  const [game, setGame] = useState(null);

  useEffect(() => {
    // A document restored from the back/forward cache can retain a pending launch.
    const reset = (event) => { if (event.persisted) setGame(null); };
    window.addEventListener("pageshow", reset);
    return () => window.removeEventListener("pageshow", reset);
  }, []);

  return {
    show(nextGame) {
      // Commit before requesting fullscreen or starting route/file preparation.
      flushSync(() => setGame(nextGame));
    },
    dismiss() { setGame(null); },
    overlay: game ? createPortal(
      <div className="game-launch-feedback" role="status" aria-live="polite" aria-busy="true">
        <GameBootOverlay game={game} bootStatusText="Loading game…" showBootOverlay showBundledTags={showBundledTags} />
      </div>,
      document.body,
    ) : null,
  };
}
