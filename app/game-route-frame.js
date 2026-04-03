"use client";

import { LogOut, Maximize, Minimize } from "lucide-react";
import { useEffect, useRef, useState } from "react";

function getSafeHref(href) {
  if (!href) {
    return "/";
  }

  try {
    const resolvedUrl = new URL(href, window.location.href);

    if (resolvedUrl.origin !== window.location.origin) {
      return "/";
    }

    return `${resolvedUrl.pathname}${resolvedUrl.search}${resolvedUrl.hash}`;
  } catch {
    return "/";
  }
}

function getExitHrefFromSrc(src) {
  if (typeof window === "undefined") {
    return "/";
  }

  try {
    const resolvedUrl = new URL(src, window.location.href);
    return getSafeHref(resolvedUrl.searchParams.get("exitTo") || "/");
  } catch {
    return "/";
  }
}

export default function GameRouteFrame({ src, target, title }) {
  const shellRef = useRef(null);
  const frameRef = useRef(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [canFullscreen, setCanFullscreen] = useState(true);
  const [exitHref, setExitHref] = useState("/");

  useEffect(() => {
    function navigateHome(href = "/") {
      window.location.replace(getSafeHref(href));
    }

    function handleMessage(event) {
      if (event.origin !== window.location.origin || event.data?.type !== "scummvm-exit") {
        return;
      }

      navigateHome(event.data.href || "/");
    }

    window.addEventListener("message", handleMessage);

    return () => {
      window.removeEventListener("message", handleMessage);
    };
  }, []);

  useEffect(() => {
    setExitHref(getExitHrefFromSrc(src));
  }, [src]);

  useEffect(() => {
    let focusTimer = 0;
    let attempts = 0;
    const iframe = frameRef.current;

    if (!iframe) {
      return;
    }

    function focusGameCanvas() {
      const frame = frameRef.current;

      if (!frame) {
        return false;
      }

      try {
        frame.focus({ preventScroll: true });
      } catch {}

      try {
        frame.contentWindow?.focus();
      } catch {}

      try {
        const canvas = frame.contentDocument?.getElementById("canvas");

        if (!(canvas instanceof HTMLElement)) {
          return false;
        }

        canvas.focus({ preventScroll: true });
        return frame.contentDocument?.activeElement === canvas;
      } catch {
        return false;
      }
    }

    function scheduleFocusAttempt() {
      if (focusTimer) {
        return;
      }

      const runAttempt = () => {
        attempts += 1;
        focusTimer = 0;

        if (focusGameCanvas() || attempts >= 40) {
          return;
        }

        focusTimer = window.setTimeout(runAttempt, 250);
      };

      runAttempt();
    }

    scheduleFocusAttempt();
    iframe.addEventListener("load", scheduleFocusAttempt);

    return () => {
      iframe.removeEventListener("load", scheduleFocusAttempt);

      if (focusTimer) {
        window.clearTimeout(focusTimer);
      }
    };
  }, [src]);

  useEffect(() => {
    function syncFullscreenState() {
      const shell = shellRef.current;
      const fullscreenElement =
        document.fullscreenElement || document.webkitFullscreenElement || null;

      setIsFullscreen(Boolean(shell && fullscreenElement === shell));
    }

    const shell = shellRef.current;
    const supportsFullscreen = Boolean(
      shell &&
        (shell.requestFullscreen || shell.webkitRequestFullscreen) &&
        (document.exitFullscreen || document.webkitExitFullscreen),
    );

    setCanFullscreen(supportsFullscreen);
    syncFullscreenState();

    document.addEventListener("fullscreenchange", syncFullscreenState);
    document.addEventListener("webkitfullscreenchange", syncFullscreenState);

    return () => {
      document.removeEventListener("fullscreenchange", syncFullscreenState);
      document.removeEventListener("webkitfullscreenchange", syncFullscreenState);
    };
  }, []);

  async function handleFullscreenToggle() {
    const shell = shellRef.current;

    if (!shell) {
      return;
    }

    try {
      if (document.fullscreenElement === shell || document.webkitFullscreenElement === shell) {
        if (document.exitFullscreen) {
          await document.exitFullscreen();
        } else if (document.webkitExitFullscreen) {
          await document.webkitExitFullscreen();
        }

        return;
      }

      if (shell.requestFullscreen) {
        await shell.requestFullscreen();
      } else if (shell.webkitRequestFullscreen) {
        await shell.webkitRequestFullscreen();
      }
    } catch (error) {
      console.error("Failed to toggle fullscreen mode.", error);
    }
  }

  async function handleExitClick() {
    const shell = shellRef.current;

    if (shell) {
      try {
        if (document.fullscreenElement === shell || document.webkitFullscreenElement === shell) {
          if (document.exitFullscreen) {
            await document.exitFullscreen();
          } else if (document.webkitExitFullscreen) {
            await document.webkitExitFullscreen();
          }
        }
      } catch (error) {
        console.error("Failed to exit fullscreen mode before leaving the game.", error);
      }
    }

    window.location.replace(exitHref);
  }

  const FullscreenIcon = isFullscreen ? Minimize : Maximize;
  const fullscreenLabel = isFullscreen ? "Exit fullscreen" : "Enter fullscreen";

  return (
    <div className="game-route-shell" ref={shellRef}>
      <div className="game-route-controls">
        {canFullscreen ? (
          <button
            aria-label={fullscreenLabel}
            className="game-route-control-button"
            onClick={handleFullscreenToggle}
            title={fullscreenLabel}
            type="button"
          >
            <FullscreenIcon aria-hidden="true" size={18} strokeWidth={2} />
          </button>
        ) : null}
        <button
          aria-label="Exit game"
          className="game-route-control-button"
          onClick={handleExitClick}
          title="Exit game"
          type="button"
        >
          <LogOut aria-hidden="true" size={17} strokeWidth={2} />
        </button>
      </div>
      <iframe
        allow="autoplay; fullscreen"
        allowFullScreen
        className="game-route-frame"
        data-scummvm-route-frame="true"
        data-scummvm-target={target}
        ref={frameRef}
        loading="eager"
        src={src}
        title={title}
      />
    </div>
  );
}
