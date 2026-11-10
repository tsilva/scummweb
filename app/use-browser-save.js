"use client";

import { useCallback, useSyncExternalStore } from "react";
import { scummvmAssetVersion } from "./asset-paths";
import { getCachedBrowserSave, subscribeBrowserSaves } from "./browser-saves.mjs";

const noSave = () => null;
const noSubscription = () => () => {};

export default function useBrowserSave(game, enabled = true, readSave = getCachedBrowserSave) {
  const key = JSON.stringify([game.target, game.engineId, game.gameId, game.extra,
    game.saveVersionId, game.saveNamespace, game.nativeTarget]);
  const identity = () => {
    const [target, engineId, gameId, extra, saveVersionId, saveNamespace, nativeTarget] = JSON.parse(key);
    return { target, engineId, gameId, extra, saveVersionId, saveNamespace, nativeTarget };
  };
  const snapshot = useCallback(() => readSave(identity()), [key, readSave]);
  const subscribe = useCallback((notify) => subscribeBrowserSaves(identity(), scummvmAssetVersion, notify), [key]);
  // Server HTML offers Play; hydration reads browser metadata immediately.
  // Native reconciliation never gates the action or supplies a loading state.
  return useSyncExternalStore(enabled ? subscribe : noSubscription, enabled ? snapshot : noSave, noSave);
}
