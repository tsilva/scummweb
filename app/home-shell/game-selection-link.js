"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import { buildGameExitHref } from "./hero-selection.mjs";
import { useGameNavigation } from "./game-navigation";
import { useArtworkDelivery } from "./artwork-delivery";
import { preloadSelectedHero } from "./hero-preload.mjs";

export default function GameSelectionLink({ game, children, onPointerEnter, onPointerLeave,
  onPointerDown, onPointerCancel, onFocus, onBlur, ...props }) {
  const selectGame = useGameNavigation();
  const artwork = useArtworkDelivery();
  const cancelPreload = useRef(null);
  const warmHero = (committed = false) => {
    cancelPreload.current = preloadSelectedHero(game, artwork, committed);
  };
  const releaseHero = () => cancelPreload.current?.();
  useEffect(() => () => cancelPreload.current?.(), []);
  return <Link {...props} href={buildGameExitHref(game)} prefetch={selectGame ? false : undefined} scroll={false}
    onPointerEnter={(event) => { warmHero(); onPointerEnter?.(event); }}
    onPointerLeave={(event) => { releaseHero(); onPointerLeave?.(event); }}
    onPointerDown={(event) => { warmHero(); onPointerDown?.(event); }}
    onPointerCancel={(event) => { releaseHero(); onPointerCancel?.(event); }}
    onFocus={(event) => { warmHero(); onFocus?.(event); }}
    onBlur={(event) => { releaseHero(); onBlur?.(event); }}
    onNavigate={(event) => {
      warmHero(true);
      if (selectGame?.(game)) event.preventDefault();
      window.scrollTo({ top: 0, behavior: "instant" });
    }}>{children}</Link>;
}
