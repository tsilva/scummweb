"use client";

import { useEffect, useState } from "react";

const SCUMMVM_MENU_REVEAL_DELAY_MS = 2500;
const SKIP_INTRO_REVEAL_DELAY_MS = 4500;
const BOOT_FAILURE_PATTERNS = [
  /Game data path does not exist/i,
  /Couldn't identify game/i,
  /No game data was found/i,
  /TypeError/i,
  /ReferenceError/i,
  /abort\(/i,
];

export function useBootState({ frameRef, frameSrc, readySignal, skipIntro, skipIntroConsumed }) {
  const [showScummvmMenuButton, setShowScummvmMenuButton] = useState(false);
  const [showSkipIntroButton, setShowSkipIntroButton] = useState(false);
  const [bootStatusText, setBootStatusText] = useState("Downloading ScummVM...");
  const [bootProgressValue, setBootProgressValue] = useState(null);
  const [bootProgressMax, setBootProgressMax] = useState(null);
  const [hasBootCompleted, setHasBootCompleted] = useState(false);
  const [hasBootPresentationCompleted, setHasBootPresentationCompleted] = useState(false);
  const [hasBootFailed, setHasBootFailed] = useState(false);

  useEffect(() => {
    setHasBootPresentationCompleted(false);
    setShowScummvmMenuButton(false);
    setShowSkipIntroButton(false);
  }, [frameSrc, skipIntro, skipIntroConsumed]);

  useEffect(() => {
    if (!hasBootCompleted || hasBootFailed) {
      setHasBootPresentationCompleted(false);
      setShowScummvmMenuButton(false);
      return;
    }

    const revealTimer = window.setTimeout(() => {
      setHasBootPresentationCompleted(true);
      setShowScummvmMenuButton(true);
    }, SCUMMVM_MENU_REVEAL_DELAY_MS);

    return () => {
      window.clearTimeout(revealTimer);
    };
  }, [frameSrc, hasBootCompleted, hasBootFailed]);

  useEffect(() => {
    if (!skipIntro || skipIntroConsumed || !hasBootCompleted || hasBootFailed) {
      return;
    }

    const revealTimer = window.setTimeout(() => {
      setShowSkipIntroButton(true);
    }, SKIP_INTRO_REVEAL_DELAY_MS);

    return () => {
      window.clearTimeout(revealTimer);
    };
  }, [frameSrc, hasBootCompleted, hasBootFailed, skipIntro, skipIntroConsumed]);

  useEffect(() => {
    if (readySignal) {
      setHasBootCompleted(true);
      setHasBootFailed(false);
    }
  }, [frameSrc, readySignal]);

  useEffect(() => {
    if (readySignal) {
      return undefined;
    }

    let pollTimer = 0;
    let cancelled = false;

    setBootStatusText("Downloading ScummVM...");
    setBootProgressValue(null);
    setBootProgressMax(null);
    setHasBootCompleted(false);
    setHasBootFailed(false);

    function syncBootState() {
      if (cancelled) {
        return;
      }

      const iframe = frameRef.current;

      if (!iframe) {
        return;
      }

      try {
        const frameDocument = iframe.contentDocument;
        const statusElement = frameDocument?.getElementById("status");
        const progressElement = frameDocument?.getElementById("progress");
        const outputElement = frameDocument?.getElementById("output");
        const nextStatusText = statusElement?.textContent?.trim() || "Downloading ScummVM...";
        const outputValue =
          outputElement && typeof outputElement === "object" && "value" in outputElement
            ? outputElement.value || ""
            : "";
        const progressVisible =
          progressElement &&
          typeof progressElement === "object" &&
          "value" in progressElement &&
          "max" in progressElement &&
          !progressElement.hidden;
        const nextProgressValue = progressVisible ? progressElement.value : null;
        const nextProgressMax = progressVisible ? progressElement.max : null;
        const hitFailureState =
          statusElement?.classList.contains("error") ||
          /Exception thrown/i.test(nextStatusText) ||
          BOOT_FAILURE_PATTERNS.some((pattern) => pattern.test(outputValue));

        setBootStatusText((currentValue) =>
          currentValue === nextStatusText ? currentValue : nextStatusText
        );
        setBootProgressValue((currentValue) =>
          currentValue === nextProgressValue ? currentValue : nextProgressValue
        );
        setBootProgressMax((currentValue) =>
          currentValue === nextProgressMax ? currentValue : nextProgressMax
        );

        if (hitFailureState) {
          setHasBootFailed(true);
        }
      } catch {}

      pollTimer = window.setTimeout(syncBootState, 120);
    }

    syncBootState();

    return () => {
      cancelled = true;

      if (pollTimer) {
        window.clearTimeout(pollTimer);
      }
    };
  }, [frameRef, frameSrc, readySignal]);

  useEffect(() => {
    setHasBootCompleted(false);
  }, [frameSrc]);

  function dismissSkipIntroButton() {
    setShowSkipIntroButton(false);
  }

  return {
    bootProgressMax,
    bootProgressValue,
    bootStatusText,
    dismissSkipIntroButton,
    hasBootCompleted,
    hasBootFailed,
    hasBootPresentationCompleted,
    showScummvmMenuButton,
    showSkipIntroButton,
  };
}
