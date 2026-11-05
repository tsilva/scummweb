"use client";

import { useEffect, useState } from "react";
import { scummvmAssetVersion } from "./asset-paths";
import { getLatestBrowserSave } from "./browser-saves.mjs";

export default function useBrowserSave(game, enabled = true) {
  const key = JSON.stringify([game.target, game.engineId, game.gameId, game.extra,
    game.saveVersionId, game.saveNamespace]);
  const [result, setResult] = useState(null);

  useEffect(() => {
    if (!enabled) return;
    let active = true;
    let request = 0;
    async function refresh() {
      const current = ++request;
      const slot = await getLatestBrowserSave(game, scummvmAssetVersion);
      if (active && current === request) setResult({ key, slot });
    }
    void refresh();
    window.addEventListener("storage", refresh);
    window.addEventListener("pageshow", refresh);
    window.addEventListener("scummweb:saves-changed", refresh);
    return () => {
      active = false;
      window.removeEventListener("storage", refresh);
      window.removeEventListener("pageshow", refresh);
      window.removeEventListener("scummweb:saves-changed", refresh);
    };
  }, [game, key, enabled]);

  // undefined means this version has not been checked; null means no player save.
  return result?.key === key ? result.slot : undefined;
}
