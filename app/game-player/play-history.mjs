import { addPlayedTime } from "./activity-storage.mjs";

// Start only after the player is ready. The caller stops this observer while
// a menu, failed boot, rotation prompt or exit prevents gameplay.
export function observePlayHistory(scope, version) {
  if (!version) return;
  let visibleSince = null;
  let pendingTime = 0;
  let pageActive = true;
  let stopped = false;
  let lastWrite;

  function checkpoint() {
    if (visibleSince === null) return;
    const now = scope.performance.now();
    const elapsed = pendingTime + Math.max(0, Math.round(now - visibleSince));
    pendingTime = 0;
    visibleSince = now;
    lastWrite = addPlayedTime(scope, version, elapsed, Date.now()).catch(() => {
      // Reuse the uncommitted time at the next checkpoint if storage recovers.
      pendingTime += elapsed;
    });
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
    if (stopped) return lastWrite;
    stopped = true;
    pause();
    scope.clearInterval(timer);
    scope.document.removeEventListener("visibilitychange", syncVisibility);
    scope.removeEventListener("pagehide", hide);
    scope.removeEventListener("pageshow", show);
    return lastWrite;
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
