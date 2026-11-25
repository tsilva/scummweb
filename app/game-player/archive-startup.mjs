import { sendZipGameFiles } from "../home-shell/zip-game-player.js";

const idleTimeoutMs = 120_000;
export const archiveBootTimeoutMessage = "ScummVM took too long to start. Select Exit game and try again.";

// Preparation belongs to the launch. An iframe can be replaced during that
// launch, so each observer owns its own timer and only the current frame can
// take the files. Keep the files after an idle timeout for a late receiver.
export function createArchiveStartup() {
  let files = null;
  let receiver = null;
  let delivery = "pending";

  return {
    reset() {
      files = null;
      receiver = null;
      delivery = "pending";
    },
    async prepare(loadArchive, signal, onProgress) {
      const loadedFiles = await loadArchive(signal, (progress, details) => {
        if (signal.aborted) return;
        if (details?.cached) delivery = "cached";
        else if (details?.downloading) delivery = "downloading";
        else if (progress === 100 && details?.loaded > 0) delivery = "downloaded";
        onProgress(details ?? null);
      });
      signal.throwIfAborted();
      files = loadedFiles;
      window.performance?.mark?.("scummweb:archive-prepared");
    },
    observeFrame({ frame, isCurrent, frameBoot, usesArchive, prepared, saveNamespace, onTimeout, setError }) {
      let timer;
      let disposed = false;

      function restartTimer() {
        if (frameBoot.graphicsLost || disposed) return;
        window.clearTimeout(timer);
        const activeTimer = window.setTimeout(() => {
          if (timer !== activeTimer || frameBoot.ready || !isCurrent()) return;
          if (onTimeout()) return;
          setError(archiveBootTimeoutMessage);
        }, idleTimeoutMs);
        timer = activeTimer;
      }

      function stopTimer() {
        window.clearTimeout(timer);
        timer = undefined;
        frame?.removeEventListener("load", restartTimer);
      }

      function deliver() {
        if (disposed || frameBoot.graphicsLost || !isCurrent() || !files || !receiver || receiver !== frame?.contentWindow) return;
        try {
          sendZipGameFiles(receiver, files, { saveNamespace });
          frameBoot.archiveTransferred = true;
          window.performance?.mark?.("scummweb:archive-transferred");
          files = null;
          restartTimer();
        } catch {
          files = null;
          stopTimer();
          setError("Could not prepare this version. Select Exit game and try again.");
        }
      }

      return {
        start() {
          if (frame && prepared) {
            restartTimer();
            frame.addEventListener("load", restartTimer, { once: true });
          }
          deliver();
        },
        stop: stopTimer,
        dispose() {
          disposed = true;
          stopTimer();
        },
        resetReceiver() {
          receiver = null;
        },
        receive(source) {
          window.performance?.mark?.("scummweb:runtime-ready-for-files");
          receiver = source;
          deliver();
        },
        finish() {
          stopTimer();
          frameBoot.ready = true;
          setError((current) => current === archiveBootTimeoutMessage ? null : current);
        },
        fail(status) {
          stopTimer();
          files = null;
          setError((current) => current || (status === "undetected"
            ? "ScummVM could not detect a supported game. Check that you selected the game files."
            : "ScummVM could not start this game. Check that all the game files are present."));
        },
        get receiver() { return receiver; },
        get diagnostics() {
          return {
            archive_delivery: usesArchive ? delivery : "not-required",
            archive_prepared: Boolean(prepared || files || frameBoot.archiveTransferred),
            archive_transferred: frameBoot.archiveTransferred,
          };
        },
      };
    },
  };
}
