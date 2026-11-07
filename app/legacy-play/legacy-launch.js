"use client";

import { useEffect } from "react";
import { withGameTelemetry } from "../game-player/telemetry.mjs";

export default function LegacyLaunch({ routes, primaryTarget }) {
  useEffect(() => {
    const { hash, search } = window.location;
    let args;
    try {
      args = decodeURIComponent(hash.slice(1)).trim();
    } catch {
      return;
    }
    const match = /^(?:-x\s+(\d+)\s+)?([a-z0-9_-]+)$/i.exec(args || primaryTarget);
    if (!match || !Object.hasOwn(routes, match[2])) return;

    const [, slot, target] = match;
    const params = new URLSearchParams(search);
    const playUrl = new URL(routes[target], window.location.origin);
    const exitTo = params.get("exitTo");
    if (exitTo) playUrl.searchParams.set("exitTo", exitTo);
    if (slot !== undefined) {
      const key = params.get("skipIntroTarget") === target ? "seed" : "slot";
      playUrl.hash = `${key}=${slot}`;
    }
    window.location.replace(withGameTelemetry(playUrl.href, window.location.href));
  }, [primaryTarget, routes]);

  return <main className="game-route-page"><a href="/#library">Open the game library</a></main>;
}
