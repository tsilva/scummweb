"use client";

import { Maximize, Minimize } from "lucide-react";
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

export default function GameRouteFrame({ src, target, title }) {
  const shellRef = useRef(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [canFullscreen, setCanFullscreen] = useState(true);

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

  const FullscreenIcon = isFullscreen ? Minimize : Maximize;
  const fullscreenLabel = isFullscreen ? "Exit fullscreen" : "Enter fullscreen";

  return (
    <div className="game-route-shell" ref={shellRef}>
      {canFullscreen ? (
        <button
          aria-label={fullscreenLabel}
          className="game-route-fullscreen-button"
          onClick={handleFullscreenToggle}
          title={fullscreenLabel}
          type="button"
        >
          <FullscreenIcon aria-hidden="true" size={18} strokeWidth={2} />
        </button>
      ) : null}
      <iframe
        allow="autoplay; fullscreen"
        allowFullScreen
        className="game-route-frame"
        data-scummvm-route-frame="true"
        data-scummvm-target={target}
        loading="eager"
        src={src}
        title={title}
      />
    </div>
  );
}
