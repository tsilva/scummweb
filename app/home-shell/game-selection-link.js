"use client";

import Link from "next/link";
import { buildGameExitHref } from "./hero-selection.mjs";

export default function GameSelectionLink({ game, children, ...props }) {
  return <Link {...props} href={buildGameExitHref(game)} scroll={false} onNavigate={() => {
    window.scrollTo({ top: 0, behavior: "instant" });
  }}>{children}</Link>;
}
