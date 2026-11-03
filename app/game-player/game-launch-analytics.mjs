import { DEFAULT_SITE_URL, GOOGLE_ANALYTICS_ID } from "../../lib/site-config.mjs";

const PLAY_MILESTONE_MS = 5 * 60 * 1000;
const ENTRY_POINTS = new Set(["hero", "library", "game_detail"]);

export function createGameLaunchAnalytics(gameSlug) {
  let attempt = null;
  let launched = false;
  let reportedFailure = false;
  let foregroundMs = 0;
  let reportedMilestone = false;

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
          game_slug: gameSlug,
          entry_point: ENTRY_POINTS.has(entryPoint) ? entryPoint : "direct",
          launch_mode: window.location.hash === "#continue" ? "continue" : "fresh",
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
      if (!launched || reportedMilestone) return;

      let pageActive = true;
      let visibleSince = null;
      let timer;

      function pause() {
        if (visibleSince === null) return;
        foregroundMs += window.performance.now() - visibleSince;
        visibleSince = null;
        window.clearTimeout(timer);

        if (foregroundMs >= PLAY_MILESTONE_MS && !reportedMilestone) {
          reportedMilestone = true;
          send("game_play_milestone", { play_time_seconds: PLAY_MILESTONE_MS / 1000 });
        }
      }

      function syncVisibility() {
        if (!pageActive || document.visibilityState !== "visible") {
          pause();
          return;
        }
        if (visibleSince !== null || reportedMilestone) return;
        visibleSince = window.performance.now();
        timer = window.setTimeout(() => {
          pause();
          syncVisibility();
        }, Math.ceil(PLAY_MILESTONE_MS - foregroundMs));
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
      return () => {
        pause();
        document.removeEventListener("visibilitychange", syncVisibility);
        window.removeEventListener("pagehide", hidePage);
        window.removeEventListener("pageshow", showPage);
      };
    },
  };
}
