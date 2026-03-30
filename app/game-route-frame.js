"use client";

import { useEffect, useRef } from "react";

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
  const iframeRef = useRef(null);

  useEffect(() => {
    const iframe = iframeRef.current;
    let detachFrameListeners = () => {};

    function navigateHome(href = "/") {
      window.location.replace(getSafeHref(href));
    }

    function handleEscape(event) {
      if (
        event.key !== "Escape" ||
        event.defaultPrevented ||
        event.metaKey ||
        event.ctrlKey ||
        event.altKey ||
        event.shiftKey
      ) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      navigateHome("/");
    }

    function handleMessage(event) {
      if (event.origin !== window.location.origin || event.data?.type !== "scummvm-exit") {
        return;
      }

      navigateHome(event.data.href || "/");
    }

    function attachFrameListeners() {
      detachFrameListeners();

      try {
        const frameWindow = iframe?.contentWindow;
        const frameDocument = frameWindow?.document;

        if (!frameWindow || !frameDocument) {
          return;
        }

        frameWindow.addEventListener("keydown", handleEscape, true);
        frameDocument.addEventListener("keydown", handleEscape, true);

        detachFrameListeners = () => {
          frameWindow.removeEventListener("keydown", handleEscape, true);
          frameDocument.removeEventListener("keydown", handleEscape, true);
        };
      } catch {
        detachFrameListeners = () => {};
      }
    }

    window.addEventListener("keydown", handleEscape, true);
    window.addEventListener("message", handleMessage);
    iframe?.addEventListener("load", attachFrameListeners);
    attachFrameListeners();

    return () => {
      window.removeEventListener("keydown", handleEscape, true);
      window.removeEventListener("message", handleMessage);
      iframe?.removeEventListener("load", attachFrameListeners);
      detachFrameListeners();
    };
  }, []);

  return (
    <iframe
      ref={iframeRef}
      allow="autoplay; fullscreen"
      allowFullScreen
      className="game-route-frame"
      data-scummvm-route-frame="true"
      data-scummvm-target={target}
      loading="eager"
      src={src}
      title={title}
    />
  );
}
