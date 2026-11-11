import { DEFAULT_SITE_URL, GOOGLE_ANALYTICS_ID } from "../../lib/site-config.mjs";
import { classifyAnalyticsTraffic } from "../../lib/analytics-traffic.mjs";

// Preserve the existing five-minute event's meaning for historical reports.
const PLAY_MILESTONES = [
  { ms: 30_000, event: "game_play_30s" },
  { ms: 60_000, event: "game_play_60s" },
  { ms: 300_000, event: "game_play_milestone" },
];
const ENTRY_POINTS = new Set(["hero", "library", "game_detail"]);

export function createGameLaunchAnalytics(gameSlug) {
  let attempt = null;
  let launched = false;
  let reportedFailure = false;
  let foregroundMs = 0;
  let nextMilestone = 0;
  let stopWatching = null;

  function send(name, fields = {}) {
    window.gtag("event", name, { ...attempt.fields, ...fields, send_to: GOOGLE_ANALYTICS_ID });
  }

  return {
    start() {
      if (attempt || !gameSlug || window.location.origin !== DEFAULT_SITE_URL ||
          typeof window.gtag !== "function") return;

      const entryPoint = new URLSearchParams(window.location.search).get("launch_from");
      attempt = {
        startedAt: window.performance.now(),
        fields: {
          launch_id: window.crypto.randomUUID(),
          game_slug: gameSlug,
          entry_point: ENTRY_POINTS.has(entryPoint) ? entryPoint : "direct",
          launch_mode: window.location.hash === "#continue" ? "continue" : "fresh",
          ...classifyAnalyticsTraffic(window, DEFAULT_SITE_URL),
        },
      };
      send("game_launch_attempt");
    },

    confirm() {
      if (!attempt || launched) return;
      launched = true;
      send("game_launch", { load_time_ms: Math.round(window.performance.now() - attempt.startedAt) });
    },

    fail(reason) {
      if (!attempt || launched || reportedFailure) return;
      reportedFailure = true;
      send("game_launch_failed", { failure_reason: reason });
    },

    watchPlayTime() {
      if (!launched || nextMilestone === PLAY_MILESTONES.length) return;
      // A duplicate watcher must not double-count the same foreground interval.
      stopWatching?.();

      let pageActive = true;
      let visibleSince = null;
      let timer;

      function pause() {
        if (visibleSince === null) return;
        foregroundMs += window.performance.now() - visibleSince;
        visibleSince = null;
        window.clearTimeout(timer);

        while (nextMilestone < PLAY_MILESTONES.length &&
            foregroundMs >= PLAY_MILESTONES[nextMilestone].ms) {
          const milestone = PLAY_MILESTONES[nextMilestone++];
          send(milestone.event, { play_time_seconds: milestone.ms / 1000 });
        }
      }

      function syncVisibility() {
        if (!pageActive || document.visibilityState !== "visible") {
          pause();
          return;
        }
        if (visibleSince !== null || nextMilestone === PLAY_MILESTONES.length) return;
        visibleSince = window.performance.now();
        timer = window.setTimeout(() => {
          pause();
          syncVisibility();
        }, Math.ceil(PLAY_MILESTONES[nextMilestone].ms - foregroundMs));
      }

      function hidePage() {
        pageActive = false;
        pause();
      }

      function showPage() {
        pageActive = true;
        syncVisibility();
      }

      document.addEventListener("visibilitychange", syncVisibility);
      window.addEventListener("pagehide", hidePage);
      window.addEventListener("pageshow", showPage);
      syncVisibility();
      const stop = () => {
        pause();
        document.removeEventListener("visibilitychange", syncVisibility);
        window.removeEventListener("pagehide", hidePage);
        window.removeEventListener("pageshow", showPage);
        if (stopWatching === stop) stopWatching = null;
      };
      stopWatching = stop;
      return stop;
    },
  };
}
