"use client";

import Link from "next/link";
import { buildGameExitHref } from "./hero-selection.mjs";
import { useGameNavigation } from "./game-navigation";

export default function GameSelectionLink({ game, children, ...props }) {
  const selectGame = useGameNavigation();
  return <Link {...props} href={buildGameExitHref(game)} prefetch={selectGame ? false : undefined} scroll={false} onNavigate={(event) => {
    if (selectGame?.(game)) event.preventDefault();
    window.scrollTo({ top: 0, behavior: "instant" });
  }}>{children}</Link>;
}
