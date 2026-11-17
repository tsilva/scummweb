const storagePrefix = "scummweb.play-history.v1:";
export const playHistoryUpdatedEvent = "scummweb:play-history-updated";

export function readPlayHistory(scope, version) {
  try {
    const entry = JSON.parse(scope.localStorage.getItem(storagePrefix + version));
    if (Number.isSafeInteger(entry?.playedMs) && entry.playedMs >= 0 &&
        Number.isSafeInteger(entry.lastPlayedAt) && entry.lastPlayedAt > 0 && entry.lastPlayedAt <= 8.64e15) return entry;
  } catch { /* Playback works without browser storage. */ }
  return null;
}

// Start only after the player is ready. The caller stops this observer while
// a menu, failed boot, rotation prompt or exit prevents gameplay.
export function observePlayHistory(scope, version) {
  if (!version) return;
  let visibleSince = null;
  let pageActive = true;
  let stopped = false;

  function checkpoint() {
    if (visibleSince === null) return;
    const now = scope.performance.now();
    const elapsed = Math.max(0, Math.round(now - visibleSince));
    visibleSince = now;
    try {
      const previous = readPlayHistory(scope, version);
      scope.localStorage.setItem(storagePrefix + version, JSON.stringify({
        playedMs: Math.min(Number.MAX_SAFE_INTEGER, (previous?.playedMs ?? 0) + elapsed),
        lastPlayedAt: Date.now(),
      }));
      scope.dispatchEvent(new Event(playHistoryUpdatedEvent));
    } catch { /* Play history is optional. */ }
  }

  function pause() {
    checkpoint();
    visibleSince = null;
  }

  function syncVisibility() {
    if (!pageActive || scope.document.visibilityState !== "visible") {
      pause();
    } else if (visibleSince === null) {
      visibleSince = scope.performance.now();
      checkpoint();
    }
  }

  const hide = () => { pageActive = false; pause(); };
  const show = () => { pageActive = true; syncVisibility(); };
  scope.document.addEventListener("visibilitychange", syncVisibility);
  scope.addEventListener("pagehide", hide);
  scope.addEventListener("pageshow", show);
  const timer = scope.setInterval(checkpoint, 15_000);
  syncVisibility();
  return () => {
    if (stopped) return;
    stopped = true;
    pause();
    scope.clearInterval(timer);
    scope.document.removeEventListener("visibilitychange", syncVisibility);
    scope.removeEventListener("pagehide", hide);
    scope.removeEventListener("pageshow", show);
  };
}

export function formatPlayedTime(playedMs) {
  if (!Number.isFinite(playedMs) || playedMs < 0) return "—";
  const minutes = Math.floor(playedMs / 60_000);
  if (!minutes) return "<1m";
  return minutes < 60 ? `${minutes}m` : `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

export function formatLastPlayed(timestamp, now = Date.now()) {
  if (!Number.isFinite(timestamp) || timestamp <= 0) return "—";
  const minutes = Math.max(0, Math.floor((now - timestamp) / 60_000));
  if (!minutes) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  if (minutes < 1440) return `${Math.floor(minutes / 60)}h ago`;
  return `${Math.floor(minutes / 1440)}d ago`;
}
