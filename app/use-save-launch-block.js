"use client";

import { useSyncExternalStore } from "react";
import { editionKey, saveLaunchBlocked } from "../web-shell/save-editions.mjs";
import { readVersionSaveNamespace } from "./game-versions.mjs";

const listeners = new Set();
const ready = () => false;
const noSubscription = () => () => {};
let snapshot, pending, timer;

function refreshLocks() {
  if (document.hidden || pending) return;
  pending = navigator.locks.query().then((locks) => {
    if (!listeners.size) return;
    snapshot = locks;
    for (const notify of listeners) notify();
  }, () => {}).finally(() => { pending = undefined; });
}

function subscribe(notify) {
  listeners.add(notify);
  if (listeners.size === 1) {
    refreshLocks();
    timer = setInterval(refreshLocks, 250);
    document.addEventListener("visibilitychange", refreshLocks);
    window.addEventListener("scummweb:saves-changed", refreshLocks);
  }
  return () => {
    listeners.delete(notify);
    if (listeners.size) return;
    clearInterval(timer);
    document.removeEventListener("visibilitychange", refreshLocks);
    window.removeEventListener("scummweb:saves-changed", refreshLocks);
    snapshot = undefined;
  };
}

export default function useSaveLaunchBlock(game, enabled = true) {
  const edition = editionKey(game.saveNamespace || (game.saveVersionId && readVersionSaveNamespace(game.saveVersionId)), game.target);
  return useSyncExternalStore(enabled && globalThis.navigator?.locks?.query ? subscribe : noSubscription,
    enabled ? () => saveLaunchBlocked(snapshot, edition) : ready, ready);
}
