"use client";

import { useEffect, useState } from "react";
import { createPortal, flushSync } from "react-dom";
import GameBootOverlay from "./GameBootOverlay";

export default function useLaunchFeedback() {
  const [game, setGame] = useState(null);

  useEffect(() => {
    // A full-page desktop launch can return through the back/forward cache.
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
        <GameBootOverlay game={game} bootStatusText="Loading game…" showBootOverlay />
      </div>,
      document.body,
    ) : null,
  };
}
