"use client";

import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { usePathname } from "next/navigation";
import { captureException } from "@sentry/nextjs";

const dismissalKey = "scummweb.install-prompt-dismissed";
const visitsKey = "scummweb.install-prompt-visits";
const minimumVisits = 3;
const appDisplayModes = "(display-mode: standalone), (display-mode: fullscreen), (display-mode: minimal-ui), (display-mode: window-controls-overlay)";
const instructions = {
  native: "Launch it like any other app.",
  ios: "In Safari, choose Share, then Add to Home Screen. Turn on Open as Web App if shown.",
  mac: "In Safari on macOS Sonoma or later, choose File, then Add to Dock.",
  menu: "Open your browser menu and choose the option to install ScummWEB.",
};

function safariInstallOption() {
  const { userAgent, maxTouchPoints } = navigator;
  if (!/Version\/\d+.*Safari\//.test(userAgent)) return null;
  if (/iPhone|iPad|iPod/.test(userAgent) || (/Macintosh/.test(userAgent) && maxTouchPoints > 1)) {
    return "ios";
  }
  return /Macintosh/.test(userAgent) ? "mac" : null;
}

export default function InstallPrompt() {
  const pathname = usePathname();
  const [offer, setOffer] = useState(null);
  const offerHandled = useRef(false);
  const [stylesReady, setStylesReady] = useState(false);

  useEffect(() => {
    if (window.top !== window || !window.isSecureContext) return;
    const displayMode = window.matchMedia(appDisplayModes);
    if (displayMode.matches || navigator.standalone) return;
    try {
      if (window.localStorage.getItem(dismissalKey)) return;
      // A document counts once, including effect replays and client-side remounts.
      if (window.scummwebInstallVisitCount === undefined) {
        const stored = Number(window.localStorage.getItem(visitsKey));
        const previous = Number.isSafeInteger(stored) && stored >= 0 ? stored : 0;
        const visits = Math.min(previous + 1, minimumVisits);
        window.localStorage.setItem(visitsKey, String(visits));
        window.scummwebInstallVisitCount = visits;
      }
      if (window.scummwebInstallVisitCount < minimumVisits) return;
    } catch {
      // Stay quiet if visits and permanent dismissal cannot be remembered.
      return;
    }

    const safariOption = safariInstallOption();

    function refresh() {
      if (offerHandled.current || displayMode.matches || navigator.standalone) {
        setOffer(null);
        return;
      }
      setOffer(window.scummwebInstallPrompt ? "native" : safariOption);
    }

    function hideOffer() {
      offerHandled.current = true;
      setOffer(null);
    }

    function syncDismissal(event) {
      if (event.key === dismissalKey && event.newValue) hideOffer();
    }

    window.addEventListener("beforeinstallprompt", refresh);
    window.addEventListener("appinstalled", hideOffer);
    window.addEventListener("storage", syncDismissal);
    displayMode.addEventListener("change", refresh);
    refresh();
    return () => {
      window.removeEventListener("beforeinstallprompt", refresh);
      window.removeEventListener("appinstalled", hideOffer);
      window.removeEventListener("storage", syncDismissal);
      displayMode.removeEventListener("change", refresh);
    };
  }, []);

  useEffect(() => {
    if (pathname !== "/" || !offer || stylesReady) return;
    let active = true;
    const ready = () => { if (active) setStylesReady(true); };
    void import("./install-prompt-styles").then(ready, (error) => {
      captureException(error, { tags: { feature: "install-prompt-styles" } });
      // Keep installation and dismissal available if the optional styles fail.
      ready();
    });
    return () => { active = false; };
  }, [offer, pathname, stylesReady]);

  function dismiss() {
    offerHandled.current = true;
    try { window.localStorage.setItem(dismissalKey, "1"); } catch {}
    setOffer(null);
  }

  async function install() {
    const prompt = window.scummwebInstallPrompt;
    if (!prompt) return;
    offerHandled.current = true;
    window.scummwebInstallPrompt = null;
    setOffer(null);
    try { await prompt.prompt(); }
    catch { setOffer("menu"); }
  }

  if (pathname !== "/" || !offer || !stylesReady) return null;

  return (
    <aside className="install-prompt" aria-label="Install ScummWEB">
      <strong>Install ScummWEB</strong>
      <p>{instructions[offer]}</p>
      {offer === "native" && (
        <button type="button" className="secondary-button" onClick={install}>Install app</button>
      )}
      <button type="button" className="install-prompt-dismiss" aria-label="Dismiss install invitation" onClick={dismiss}>
        <X className="icon" aria-hidden="true" />
      </button>
    </aside>
  );
}
