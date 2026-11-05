"use client";

import { useEffect, useState } from "react";
import { scummvmAssetVersion } from "./asset-paths";
import { getLatestBrowserSave } from "./browser-saves.mjs";

export default function useBrowserSave(game, enabled = true) {
  const key = JSON.stringify([game.target, game.engineId, game.gameId, game.extra,
    game.saveVersionId, game.saveNamespace, game.nativeTarget]);
  const [result, setResult] = useState(null);

  useEffect(() => {
    if (!enabled) return;
    const [target, engineId, gameId, extra, saveVersionId, saveNamespace, nativeTarget] = JSON.parse(key);
    const identity = { target, engineId, gameId, extra, saveVersionId, saveNamespace, nativeTarget };
    let active = true;
    let request = 0;
    // A native save scan may need to download an engine. Keep launching possible
    // if it stalls, and still offer Continue if that scan eventually succeeds.
    const timer = window.setTimeout(() => {
      if (active) setResult((current) => current?.key === key ? current : { key, slot: null });
    }, 5000);
    async function refresh() {
      const current = ++request;
      let slot = null;
      try { slot = await getLatestBrowserSave(identity, scummvmAssetVersion); } catch {}
      if (active && current === request) setResult({ key, slot });
    }
    void refresh();
    window.addEventListener("storage", refresh);
    window.addEventListener("pageshow", refresh);
    window.addEventListener("scummweb:saves-changed", refresh);
    return () => {
      active = false;
      window.clearTimeout(timer);
      window.removeEventListener("storage", refresh);
      window.removeEventListener("pageshow", refresh);
      window.removeEventListener("scummweb:saves-changed", refresh);
    };
  }, [key, enabled]);

  // undefined means this version has not been checked; null means no player save.
  return result?.key === key ? result.slot : undefined;
}
