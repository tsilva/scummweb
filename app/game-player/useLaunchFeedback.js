"use client";

import { useEffect, useLayoutEffect, useState } from "react";
import { createPortal, flushSync } from "react-dom";
import { usePathname } from "next/navigation";
import GameBootOverlay from "./GameBootOverlay";
import GameExitButton from "./GameExitButton";
import { buildGameExitHref } from "../home-shell/hero-selection.mjs";

export default function useLaunchFeedback({ showBundledTags = true } = {}) {
  const [game, setGame] = useState(null);
  const pathname = usePathname();

  useLayoutEffect(() => () => {
    // Loading feedback is transient, even when navigation preserves the hero.
    // Clear its body portal before leaving or hiding the originating route.
    setGame(null);
  }, [pathname]);

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
        <div className="game-route-controls">
          <div className="game-route-control-group is-left">
            <GameExitButton href={buildGameExitHref(game)} />
          </div>
        </div>
      </div>,
      document.body,
    ) : null,
  };
}
