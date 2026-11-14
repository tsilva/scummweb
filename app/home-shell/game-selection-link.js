"use client";

import Link from "next/link";
import { buildGameExitHref } from "./hero-selection.mjs";
import { useGameNavigation } from "./game-navigation";
import { useArtworkDelivery } from "./artwork-delivery";
import { preloadSelectedHero } from "./hero-preload.mjs";

export default function GameSelectionLink({ game, children, onPointerEnter, onPointerDown, onFocus, ...props }) {
  const selectGame = useGameNavigation();
  const artwork = useArtworkDelivery();
  const warmHero = () => preloadSelectedHero(game, artwork);
  return <Link {...props} href={buildGameExitHref(game)} prefetch={selectGame ? false : undefined} scroll={false}
    onPointerEnter={(event) => { warmHero(); onPointerEnter?.(event); }}
    onPointerDown={(event) => { warmHero(); onPointerDown?.(event); }}
    onFocus={(event) => { warmHero(); onFocus?.(event); }}
    onNavigate={(event) => {
      warmHero();
      if (selectGame?.(game)) event.preventDefault();
      window.scrollTo({ top: 0, behavior: "instant" });
    }}>{children}</Link>;
}
