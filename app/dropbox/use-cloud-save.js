"use client";

import { useCallback, useSyncExternalStore } from "react";
import { supportsContinue } from "../../web-shell/continue-saves.mjs";
import { readVersionSaveNamespace } from "../game-versions.mjs";
import { cloudSaveEvent, cloudSavePrefix, cloudSaveStatus } from "./local-cache.mjs";

const noSave = () => false;

function subscribe(notify) {
  function storageChanged(event) {
    if (event.key === null || event.key.startsWith(cloudSavePrefix)) notify();
  }
  window.addEventListener("storage", storageChanged);
  window.addEventListener(cloudSaveEvent, notify);
  return () => {
    window.removeEventListener("storage", storageChanged);
    window.removeEventListener(cloudSaveEvent, notify);
  };
}

export default function useCloudSave({ target, engineId, gameId, extra, saveNamespace, saveVersionId }) {
  const read = useCallback(() => {
    if (engineId && !supportsContinue(engineId, gameId || target, extra)) return false;
    const destination = saveVersionId ? saveNamespace || readVersionSaveNamespace(saveVersionId) : `catalog:${target}`;
    return Boolean(cloudSaveStatus(destination)?.hash);
  }, [target, engineId, gameId, extra, saveNamespace, saveVersionId]);
  return useSyncExternalStore(subscribe, read, noSave);
}
