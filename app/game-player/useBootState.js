"use client";

import { useEffect, useRef, useState } from "react";
import { GAME_LOADING_STATUS } from "../game-loading-status.mjs";

const GAME_MENU_REVEAL_DELAY_MS = 2500;
const BOOT_ERROR_STATUS = "Could not start this game. Exit the player and try again.";
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

export function useBootState({
  frameRef,
  frameSrc,
  readySignal,
  skipIntro,
  skipIntroConsumed,
}) {
  const [showGameMenuButton, setShowGameMenuButton] = useState(false);
  const [bootError, setBootError] = useState("");
  const [bootPhase, setBootPhase] = useState("pending");
  const hasBootCompleted = Boolean(readySignal);
  const [hasBootPresentationCompleted, setHasBootPresentationCompleted] = useState(false);
  const [hasSkipIntroBeenDismissed, setHasSkipIntroBeenDismissed] = useState(false);
  const bootPhaseRef = useRef("pending");
  const hasBootFailed = Boolean(bootError);

  useEffect(() => {
    setHasBootPresentationCompleted(false);
    setShowGameMenuButton(false);
    setHasSkipIntroBeenDismissed(false);
  }, [frameSrc, skipIntro, skipIntroConsumed]);

  useEffect(() => {
    if (!hasBootCompleted || hasBootFailed) {
      setHasBootPresentationCompleted(false);
      setShowGameMenuButton(false);
      return;
    }

    const revealTimer = window.setTimeout(() => {
      setHasBootPresentationCompleted(true);
      setShowGameMenuButton(true);
    }, GAME_MENU_REVEAL_DELAY_MS);

    return () => {
      window.clearTimeout(revealTimer);
    };
  }, [frameSrc, hasBootCompleted, hasBootFailed]);

  useEffect(() => {
    if (readySignal) {
      bootPhaseRef.current = "ready";
      setBootPhase("ready");
      setBootError("");
    }
  }, [frameSrc, readySignal]);

  useEffect(() => {
    if (readySignal) {
      return undefined;
    }

    let pollTimer = 0;
    let cancelled = false;

    bootPhaseRef.current = "pending";
    setBootPhase("pending");
    setBootError("");

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
        const outputElement = frameDocument?.getElementById("output");
        const readyState = frameWindow?.__scummwebReadyState || null;
        const shellStatusText = normalizeShellStatusText(statusElement?.textContent);
        const outputValue =
          outputElement && typeof outputElement === "object" && "value" in outputElement
            ? outputElement.value || ""
            : "";
        const nextReadyPhase = normalizeBootPhase(readyState?.state);
        const effectivePhase = nextReadyPhase
          ? getHigherBootPhase(bootPhaseRef.current, nextReadyPhase)
          : bootPhaseRef.current;
        if (effectivePhase !== bootPhaseRef.current) {
          bootPhaseRef.current = effectivePhase;
          setBootPhase((currentValue) =>
            currentValue === effectivePhase ? currentValue : effectivePhase
          );
        }

        if (statusElement?.classList.contains("error") || /Exception thrown/i.test(shellStatusText)) {
          setBootError(shellStatusText || BOOT_ERROR_STATUS);
        } else if (BOOT_FAILURE_PATTERNS.some((pattern) => pattern.test(outputValue))) {
          setBootError((current) => current || BOOT_ERROR_STATUS);
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
    bootPhase,
    bootStatusText: bootError || GAME_LOADING_STATUS,
    dismissSkipIntroButton,
    hasBootCompleted,
    hasBootFailed,
    hasBootPresentationCompleted,
    showGameMenuButton,
    showSkipIntroButton,
  };
}
