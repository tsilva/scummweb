"use client";

import { useEffect, useRef, useState } from "react";

const SCUMMVM_MENU_REVEAL_DELAY_MS = 2500;
const INITIAL_BOOT_STATUS = "Loading ScummVM...";
const SKIP_INTRO_BOOT_STATUS = "Skipping intro...";
const BOOT_PHASE_PRIORITY = {
  idle: -1,
  pending: 0,
  "runtime-ready": 1,
  "launch-detected": 2,
  "awaiting-frame": 3,
  ready: 4,
};
const BOOT_FAILURE_PATTERNS = [
  /Game data path does not exist/i,
  /Couldn't identify game/i,
  /No game data was found/i,
  /TypeError/i,
  /ReferenceError/i,
  /abort\(/i,
];

function normalizeShellStatusText(value) {
  if (typeof value !== "string") {
    return "";
  }

  return value.replace(/⚡️?$/u, "").trim();
}

function normalizeBootPhase(value) {
  if (typeof value !== "string" || !(value in BOOT_PHASE_PRIORITY)) {
    return null;
  }

  return value;
}

function getBootPhasePriority(value) {
  const normalizedValue = normalizeBootPhase(value);
  return normalizedValue ? BOOT_PHASE_PRIORITY[normalizedValue] : Number.NEGATIVE_INFINITY;
}

function getHigherBootPhase(currentValue, nextValue) {
  return getBootPhasePriority(nextValue) > getBootPhasePriority(currentValue) ? nextValue : currentValue;
}

function getInitialBootStatusText(isSkippingIntro) {
  return isSkippingIntro ? SKIP_INTRO_BOOT_STATUS : INITIAL_BOOT_STATUS;
}

function getCuratedBootStatusText(phase, displayTitle, isSkippingIntro) {
  if (isSkippingIntro) {
    return SKIP_INTRO_BOOT_STATUS;
  }

  switch (phase) {
    case "pending":
      return INITIAL_BOOT_STATUS;
    case "runtime-ready":
      return `ScummVM loaded. Starting ${displayTitle || "the game"}...`;
    case "launch-detected":
      return `${displayTitle || "The game"} engine started. Preparing the scene...`;
    case "awaiting-frame":
      return "Almost there. Waiting for the first frame...";
    default:
      return "";
  }
}

export function useBootState({
  displayTitle,
  frameRef,
  frameSrc,
  readySignal,
  skipIntro,
  skipIntroConsumed,
}) {
  const isSkippingIntro = Boolean(skipIntro && skipIntroConsumed);
  const [showScummvmMenuButton, setShowScummvmMenuButton] = useState(false);
  const [bootStatusText, setBootStatusText] = useState(() =>
    getInitialBootStatusText(isSkippingIntro)
  );
  const [bootProgressValue, setBootProgressValue] = useState(null);
  const [bootProgressMax, setBootProgressMax] = useState(null);
  const [bootPhase, setBootPhase] = useState("pending");
  const [hasBootCompleted, setHasBootCompleted] = useState(false);
  const [hasBootPresentationCompleted, setHasBootPresentationCompleted] = useState(false);
  const [hasBootFailed, setHasBootFailed] = useState(false);
  const [hasSkipIntroBeenDismissed, setHasSkipIntroBeenDismissed] = useState(false);
  const bootPhaseRef = useRef("pending");
  const bootStatusTextRef = useRef(getInitialBootStatusText(isSkippingIntro));
  const lastNonEmptyShellStatusRef = useRef(getInitialBootStatusText(isSkippingIntro));

  useEffect(() => {
    setHasBootPresentationCompleted(false);
    setShowScummvmMenuButton(false);
    setHasSkipIntroBeenDismissed(false);
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
    if (readySignal) {
      bootPhaseRef.current = "ready";
      setBootPhase("ready");
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

    bootPhaseRef.current = "pending";
    const initialBootStatusText = getInitialBootStatusText(isSkippingIntro);

    bootStatusTextRef.current = initialBootStatusText;
    lastNonEmptyShellStatusRef.current = initialBootStatusText;
    setBootPhase("pending");
    setBootStatusText(initialBootStatusText);
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
        const frameWindow = iframe.contentWindow;
        const statusElement = frameDocument?.getElementById("status");
        const progressElement = frameDocument?.getElementById("progress");
        const outputElement = frameDocument?.getElementById("output");
        const readyState = frameWindow?.__scummwebReadyState || null;
        const rawShellStatusText = statusElement?.textContent?.trim() || "";
        const normalizedShellStatusText = normalizeShellStatusText(rawShellStatusText);
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
        const nextReadyPhase = normalizeBootPhase(readyState?.state);
        const effectivePhase = nextReadyPhase
          ? getHigherBootPhase(bootPhaseRef.current, nextReadyPhase)
          : bootPhaseRef.current;
        const hitFailureState =
          statusElement?.classList.contains("error") ||
          /Exception thrown/i.test(rawShellStatusText) ||
          BOOT_FAILURE_PATTERNS.some((pattern) => pattern.test(outputValue));

        if (normalizedShellStatusText) {
          lastNonEmptyShellStatusRef.current = normalizedShellStatusText;
        }

        if (effectivePhase !== bootPhaseRef.current) {
          bootPhaseRef.current = effectivePhase;
          setBootPhase((currentValue) =>
            currentValue === effectivePhase ? currentValue : effectivePhase
          );
        }

        const curatedBootStatusText = getCuratedBootStatusText(
          effectivePhase,
          displayTitle,
          isSkippingIntro
        );
        const nextBootStatusText = hitFailureState
          ? normalizedShellStatusText || lastNonEmptyShellStatusRef.current || bootStatusTextRef.current
          : curatedBootStatusText ||
            lastNonEmptyShellStatusRef.current ||
            bootStatusTextRef.current ||
            initialBootStatusText;

        if (nextBootStatusText !== bootStatusTextRef.current) {
          bootStatusTextRef.current = nextBootStatusText;
          setBootStatusText(nextBootStatusText);
        }

        const shouldShowBootProgress = effectivePhase === "pending" && progressVisible;
        const nextProgressValue = shouldShowBootProgress ? progressElement.value : null;
        const nextProgressMax = shouldShowBootProgress ? progressElement.max : null;

        setBootProgressValue((currentValue) => (currentValue === nextProgressValue ? currentValue : nextProgressValue));
        setBootProgressMax((currentValue) => (currentValue === nextProgressMax ? currentValue : nextProgressMax));

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
  }, [displayTitle, frameRef, frameSrc, isSkippingIntro, readySignal]);

  useEffect(() => {
    setHasBootCompleted(false);
  }, [frameSrc]);

  function dismissSkipIntroButton() {
    setHasSkipIntroBeenDismissed(true);
  }

  const showSkipIntroButton =
    Boolean(skipIntro) &&
    !skipIntroConsumed &&
    !hasBootFailed &&
    !hasSkipIntroBeenDismissed &&
    getBootPhasePriority(bootPhase) >= getBootPhasePriority("launch-detected");

  return {
    bootProgressMax,
    bootProgressValue,
    bootPhase,
    bootStatusText,
    dismissSkipIntroButton,
    hasBootCompleted,
    hasBootFailed,
    hasBootPresentationCompleted,
    showScummvmMenuButton,
    showSkipIntroButton,
  };
}
