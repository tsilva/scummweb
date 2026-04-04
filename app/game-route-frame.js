"use client";

import { LogOut, Maximize, Menu, Minimize } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { recordRecentGameTarget } from "./recent-games";

const MOBILE_BREAKPOINT_QUERY = "(max-width: 900px)";
const MOBILE_POINTER_QUERY = "(pointer: coarse)";
const LANDSCAPE_QUERY = "(orientation: landscape)";
const SCUMMVM_MENU_REVEAL_DELAY_MS = 2500;
const SKIP_INTRO_REVEAL_DELAY_MS = 4500;
const TOUCH_CLICK_MODE_STORAGE_KEY = "scummweb.touchClickMode";
const BOOT_FAILURE_PATTERNS = [
  /Game data path does not exist/i,
  /Couldn't identify game/i,
  /No game data was found/i,
  /TypeError/i,
  /ReferenceError/i,
  /abort\(/i,
];

function addMediaQueryListener(query, listener) {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return () => {};
  }

  const mediaQuery = window.matchMedia(query);

  if (typeof mediaQuery.addEventListener === "function") {
    mediaQuery.addEventListener("change", listener);

    return () => {
      mediaQuery.removeEventListener("change", listener);
    };
  }

  mediaQuery.addListener(listener);

  return () => {
    mediaQuery.removeListener(listener);
  };
}

function isMobileClient() {
  if (typeof window === "undefined") {
    return false;
  }

  const coarsePointer =
    typeof window.matchMedia === "function" && window.matchMedia(MOBILE_POINTER_QUERY).matches;
  const compactViewport =
    typeof window.matchMedia === "function" && window.matchMedia(MOBILE_BREAKPOINT_QUERY).matches;

  return coarsePointer || compactViewport || navigator.maxTouchPoints > 0;
}

function getOrientationApi() {
  if (typeof screen === "undefined") {
    return null;
  }

  return screen.orientation || null;
}

function isLandscapeClient() {
  if (typeof window === "undefined") {
    return true;
  }

  const orientationApi = getOrientationApi();

  if (typeof orientationApi?.type === "string") {
    return orientationApi.type.startsWith("landscape");
  }

  if (typeof window.matchMedia === "function") {
    return window.matchMedia(LANDSCAPE_QUERY).matches;
  }

  return window.innerWidth >= window.innerHeight;
}

function isShellFullscreen(shell) {
  if (!shell || typeof document === "undefined") {
    return false;
  }

  return document.fullscreenElement === shell || document.webkitFullscreenElement === shell;
}

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

function buildSkipIntroSaveSlotSrc(src, target, slot) {
  if (typeof window === "undefined") {
    return src;
  }

  try {
    const resolvedUrl = new URL(src, window.location.href);
    resolvedUrl.searchParams.set("skipIntroTarget", target);
    resolvedUrl.hash = ["-x", String(slot), target].join(" ");
    return `${resolvedUrl.pathname}${resolvedUrl.search}${resolvedUrl.hash}`;
  } catch {
    return src;
  }
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function getHeroImageStyle(position) {
  if (!position) {
    return undefined;
  }

  return {
    objectPosition: position,
  };
}

function getKeyboardDescriptor(input) {
  const options = typeof input === "string" ? { key: input } : input && typeof input === "object" ? input : {};
  const normalizedKey = typeof options.key === "string" && options.key.trim() ? options.key.trim() : "Escape";

  if (/^esc(?:ape)?$/i.test(normalizedKey)) {
    return {
      key: "Escape",
      code: "Escape",
      keyCode: 27,
      ctrlKey: Boolean(options.ctrlKey),
      altKey: Boolean(options.altKey),
      metaKey: Boolean(options.metaKey),
      shiftKey: Boolean(options.shiftKey),
    };
  }

  if (/^f(?:[1-9]|1[0-2])$/i.test(normalizedKey)) {
    const functionKey = normalizedKey.toUpperCase();
    const functionNumber = Number.parseInt(functionKey.slice(1), 10);

    return {
      key: functionKey,
      code:
        typeof options.code === "string" && options.code.trim() ? options.code.trim() : functionKey,
      keyCode: Number.isFinite(options.keyCode) ? options.keyCode : 111 + functionNumber,
      ctrlKey: Boolean(options.ctrlKey),
      altKey: Boolean(options.altKey),
      metaKey: Boolean(options.metaKey),
      shiftKey: Boolean(options.shiftKey),
    };
  }

  if (normalizedKey.length === 1) {
    const upperKey = normalizedKey.toUpperCase();
    const isLetter = /^[A-Z]$/.test(upperKey);
    const isDigit = /^[0-9]$/.test(normalizedKey);

    return {
      key: isLetter ? upperKey : normalizedKey,
      code:
        typeof options.code === "string" && options.code.trim()
          ? options.code.trim()
          : isLetter
            ? `Key${upperKey}`
            : isDigit
              ? `Digit${normalizedKey}`
              : "",
      keyCode: Number.isFinite(options.keyCode) ? options.keyCode : upperKey.charCodeAt(0),
      ctrlKey: Boolean(options.ctrlKey),
      altKey: Boolean(options.altKey),
      metaKey: Boolean(options.metaKey),
      shiftKey: Boolean(options.shiftKey),
    };
  }

  return {
    key: normalizedKey,
    code:
      typeof options.code === "string" && options.code.trim() ? options.code.trim() : normalizedKey,
    keyCode: Number.isFinite(options.keyCode) ? options.keyCode : 0,
    ctrlKey: Boolean(options.ctrlKey),
    altKey: Boolean(options.altKey),
    metaKey: Boolean(options.metaKey),
    shiftKey: Boolean(options.shiftKey),
  };
}

function canFocus(node) {
  return Boolean(node && typeof node.focus === "function");
}

function canDispatchEvents(node) {
  return Boolean(node && typeof node.dispatchEvent === "function");
}

function normalizeTouchClickMode(value) {
  return value === "right" ? "right" : "left";
}

function TouchClickModeIcon({ mode }) {
  const isRightMode = mode === "right";

  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <path
        d="M12 3.5c3.59 0 6.5 2.91 6.5 6.5v4.2c0 3.76-2.91 6.8-6.5 6.8s-6.5-3.04-6.5-6.8V10c0-3.59 2.91-6.5 6.5-6.5Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
      />
      <path
        d="M12 4.2v6.15"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="1.4"
      />
      <path
        d="M7.2 9.55c.22-2.27 2.14-4.05 4.48-4.05h.32v5.2H7.2v-1.15Z"
        fill={isRightMode ? "none" : "currentColor"}
        fillOpacity={isRightMode ? undefined : "0.92"}
      />
      <path
        d="M12 5.5h.32c2.34 0 4.26 1.78 4.48 4.05v1.15H12V5.5Z"
        fill={isRightMode ? "currentColor" : "none"}
        fillOpacity={isRightMode ? "0.92" : undefined}
      />
    </svg>
  );
}

export default function GameRouteFrame({ game = null, src, target, title, skipIntro = null }) {
  const shellRef = useRef(null);
  const frameRef = useRef(null);
  const [frameSrc, setFrameSrc] = useState(src);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [canFullscreen, setCanFullscreen] = useState(false);
  const [exitHref, setExitHref] = useState("/");
  const [isMobileViewport, setIsMobileViewport] = useState(false);
  const [isLandscapeViewport, setIsLandscapeViewport] = useState(true);
  const [needsImmersiveRetry, setNeedsImmersiveRetry] = useState(false);
  const [showScummvmMenuButton, setShowScummvmMenuButton] = useState(false);
  const [showSkipIntroButton, setShowSkipIntroButton] = useState(false);
  const [touchControlsUnlocked, setTouchControlsUnlocked] = useState(() => !skipIntro);
  const [bootStatusText, setBootStatusText] = useState("Downloading ScummVM...");
  const [bootProgressValue, setBootProgressValue] = useState(null);
  const [bootProgressMax, setBootProgressMax] = useState(null);
  const [hasBootCompleted, setHasBootCompleted] = useState(false);
  const [hasBootPresentationCompleted, setHasBootPresentationCompleted] = useState(false);
  const [hasBootFailed, setHasBootFailed] = useState(false);
  const [skipIntroConsumed, setSkipIntroConsumed] = useState(false);
  const [touchClickMode, setTouchClickMode] = useState(() => {
    if (typeof window === "undefined") {
      return "left";
    }

    try {
      return normalizeTouchClickMode(window.localStorage.getItem(TOUCH_CLICK_MODE_STORAGE_KEY));
    } catch {
      return "left";
    }
  });
  const autoImmersiveAttemptedRef = useRef(false);
  const immersiveRetryInFlightRef = useRef(false);

  function dismissSkipIntroButton() {
    setShowSkipIntroButton(false);
    setTouchControlsUnlocked(true);
  }

  function syncTouchClickModeToFrame(nextMode) {
    const frameWindow = frameRef.current?.contentWindow;

    if (!frameWindow) {
      return;
    }

    try {
      frameWindow.postMessage(
        {
          type: "scummweb-touch-click-mode",
          mode: normalizeTouchClickMode(nextMode),
        },
        window.location.origin,
      );
    } catch {}
  }

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
    setFrameSrc(src);
    setSkipIntroConsumed(false);
  }, [src]);

  useEffect(() => {
    setExitHref(getExitHrefFromSrc(frameSrc));
  }, [frameSrc]);

  useEffect(() => {
    recordRecentGameTarget(target);
  }, [target]);

  useEffect(() => {
    setHasBootPresentationCompleted(false);
    setShowScummvmMenuButton(false);
    setShowSkipIntroButton(false);
    setTouchControlsUnlocked(!skipIntro || skipIntroConsumed);
  }, [frameSrc, skipIntro, skipIntroConsumed]);

  useEffect(() => {
    try {
      window.localStorage.setItem(TOUCH_CLICK_MODE_STORAGE_KEY, touchClickMode);
    } catch {}

    const iframe = frameRef.current;

    if (!iframe) {
      return;
    }

    const syncMode = () => {
      syncTouchClickModeToFrame(touchClickMode);
    };

    syncMode();
    iframe.addEventListener("load", syncMode);

    return () => {
      iframe.removeEventListener("load", syncMode);
    };
  }, [frameSrc, touchClickMode]);

  useEffect(() => {
    if (!hasBootCompleted || hasBootFailed) {
      setHasBootPresentationCompleted(false);
      setShowScummvmMenuButton(false);
      return;
    }

    // The ScummVM splash is rendered inside the canvas after the boot overlay clears,
    // so keep the menu hidden briefly until the game itself is on screen.
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

    // ScummVM renders its intro inside the canvas, so use a short post-boot delay
    // before surfacing the skip action instead of showing it immediately.
    const revealTimer = window.setTimeout(() => {
      setShowSkipIntroButton(true);
    }, SKIP_INTRO_REVEAL_DELAY_MS);

    return () => {
      window.clearTimeout(revealTimer);
    };
  }, [frameSrc, hasBootCompleted, hasBootFailed, skipIntro, skipIntroConsumed]);

  useEffect(() => {
    const targetPattern = new RegExp(`User picked target '${escapeRegExp(target)}'`);
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
        const nextStatusText =
          statusElement?.textContent?.trim() || "Downloading ScummVM...";
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
        const hitReadyState = targetPattern.test(outputValue);

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
        } else if (hitReadyState) {
          setHasBootCompleted(true);
          setHasBootFailed(false);
          return;
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
  }, [frameSrc, target]);

  useEffect(() => {
    function syncViewportState() {
      setIsMobileViewport(isMobileClient());
      setIsLandscapeViewport(isLandscapeClient());
    }

    syncViewportState();

    const removeBreakpointListener = addMediaQueryListener(MOBILE_BREAKPOINT_QUERY, syncViewportState);
    const removePointerListener = addMediaQueryListener(MOBILE_POINTER_QUERY, syncViewportState);
    const removeLandscapeListener = addMediaQueryListener(LANDSCAPE_QUERY, syncViewportState);
    const orientationApi = getOrientationApi();

    window.addEventListener("resize", syncViewportState);
    window.addEventListener("orientationchange", syncViewportState);
    orientationApi?.addEventListener?.("change", syncViewportState);

    return () => {
      removeBreakpointListener();
      removePointerListener();
      removeLandscapeListener();
      window.removeEventListener("resize", syncViewportState);
      window.removeEventListener("orientationchange", syncViewportState);
      orientationApi?.removeEventListener?.("change", syncViewportState);
    };
  }, []);

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
  }, [frameSrc]);

  useEffect(() => {
    if (!skipIntro || !showSkipIntroButton) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      dismissSkipIntroButton();
    }, skipIntro.durationMinutes * 60 * 1000);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [frameSrc, showSkipIntroButton, skipIntro]);

  useEffect(() => {
    if (!skipIntro || !showSkipIntroButton) {
      return;
    }

    const iframe = frameRef.current;

    function handleEscapeKeydown(event) {
      if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) {
        return;
      }

      if (!/^esc(?:ape)?$/i.test(event.key || "")) {
        return;
      }

      dismissSkipIntroButton();
    }

    function addFrameListeners() {
      try {
        iframe?.contentWindow?.addEventListener("keydown", handleEscapeKeydown, true);
        iframe?.contentDocument?.addEventListener("keydown", handleEscapeKeydown, true);
      } catch {}
    }

    function removeFrameListeners() {
      try {
        iframe?.contentWindow?.removeEventListener("keydown", handleEscapeKeydown, true);
        iframe?.contentDocument?.removeEventListener("keydown", handleEscapeKeydown, true);
      } catch {}
    }

    window.addEventListener("keydown", handleEscapeKeydown, true);
    addFrameListeners();
    iframe?.addEventListener("load", addFrameListeners);

    return () => {
      window.removeEventListener("keydown", handleEscapeKeydown, true);
      iframe?.removeEventListener("load", addFrameListeners);
      removeFrameListeners();
    };
  }, [frameSrc, showSkipIntroButton, skipIntro]);

  useEffect(() => {
    function syncFullscreenState() {
      const shell = shellRef.current;
      const fullscreenActive = isShellFullscreen(shell);

      setIsFullscreen(fullscreenActive);

      if (!fullscreenActive) {
        const orientationApi = getOrientationApi();

        try {
          orientationApi?.unlock?.();
        } catch {}
      }
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

  useEffect(() => {
    if (!isMobileViewport || !canFullscreen || autoImmersiveAttemptedRef.current) {
      return;
    }

    autoImmersiveAttemptedRef.current = true;
    let cancelled = false;

    async function attemptAutoImmersiveMode() {
      const entered = await enterImmersiveMode({ silenceErrors: true });

      if (!cancelled && !entered) {
        setNeedsImmersiveRetry(true);
      }
    }

    void attemptAutoImmersiveMode();

    return () => {
      cancelled = true;
    };
  }, [canFullscreen, isMobileViewport]);

  useEffect(() => {
    if (!isMobileViewport || !needsImmersiveRetry) {
      return;
    }

    async function retryImmersiveMode() {
      if (immersiveRetryInFlightRef.current) {
        return;
      }

      immersiveRetryInFlightRef.current = true;

      try {
        const entered = await enterImmersiveMode({ silenceErrors: true });

        if (entered) {
          setNeedsImmersiveRetry(false);
        }
      } finally {
        immersiveRetryInFlightRef.current = false;
      }
    }

    function handleRetryKeydown(event) {
      if (event.metaKey || event.ctrlKey || event.altKey) {
        return;
      }

      void retryImmersiveMode();
    }

    window.addEventListener("pointerup", retryImmersiveMode, { passive: true });
    window.addEventListener("touchend", retryImmersiveMode, { passive: true });
    window.addEventListener("keydown", handleRetryKeydown);

    return () => {
      window.removeEventListener("pointerup", retryImmersiveMode);
      window.removeEventListener("touchend", retryImmersiveMode);
      window.removeEventListener("keydown", handleRetryKeydown);
    };
  }, [isMobileViewport, needsImmersiveRetry]);

  useEffect(() => {
    return () => {
      const orientationApi = getOrientationApi();

      try {
        orientationApi?.unlock?.();
      } catch {}
    };
  }, []);

  async function lockLandscapeOrientation({ silenceErrors = false } = {}) {
    const orientationApi = getOrientationApi();

    if (typeof orientationApi?.lock !== "function") {
      return false;
    }

    try {
      await orientationApi.lock("landscape");
      return true;
    } catch (error) {
      if (!silenceErrors) {
        console.error("Failed to lock landscape orientation.", error);
      }

      return false;
    }
  }

  async function enterImmersiveMode({ silenceErrors = false } = {}) {
    const shell = shellRef.current;

    if (!shell) {
      return false;
    }

    try {
      if (!isShellFullscreen(shell)) {
        if (shell.requestFullscreen) {
          await shell.requestFullscreen();
        } else if (shell.webkitRequestFullscreen) {
          await shell.webkitRequestFullscreen();
        } else {
          return false;
        }
      }

      if (isMobileClient()) {
        await lockLandscapeOrientation({ silenceErrors });
      }

      return isShellFullscreen(shell);
    } catch (error) {
      if (!silenceErrors) {
        console.error("Failed to enter immersive mode.", error);
      }

      return false;
    }
  }

  async function exitImmersiveMode({ silenceErrors = false } = {}) {
    const orientationApi = getOrientationApi();

    try {
      orientationApi?.unlock?.();
    } catch (error) {
      if (!silenceErrors) {
        console.error("Failed to unlock screen orientation.", error);
      }
    }

    try {
      if (document.exitFullscreen) {
        await document.exitFullscreen();
      } else if (document.webkitExitFullscreen) {
        await document.webkitExitFullscreen();
      }
    } catch (error) {
      if (!silenceErrors) {
        console.error("Failed to exit fullscreen mode.", error);
      }
    }
  }

  async function handleFullscreenToggle() {
    const shell = shellRef.current;

    if (!shell) {
      return;
    }

    try {
      if (isShellFullscreen(shell)) {
        await exitImmersiveMode();

        return;
      }

      await enterImmersiveMode();
    } catch (error) {
      console.error("Failed to toggle fullscreen mode.", error);
    }
  }

  async function handleExitClick() {
    const shell = shellRef.current;

    if (shell) {
      try {
        if (isShellFullscreen(shell)) {
          await exitImmersiveMode({ silenceErrors: true });
        }
      } catch (error) {
        console.error("Failed to exit fullscreen mode before leaving the game.", error);
      }
    }

    window.location.replace(exitHref);
  }

  async function handleImmersiveResume() {
    const entered = await enterImmersiveMode();

    if (entered) {
      setNeedsImmersiveRetry(false);
    }
  }

  function dispatchSyntheticKeypress(key) {
    const frame = frameRef.current;

    if (!frame) {
      return false;
    }

    const descriptor = getKeyboardDescriptor(key);
    const frameWindow = frame.contentWindow;
    const KeyboardEventConstructor = frameWindow?.KeyboardEvent || window.KeyboardEvent;

    try {
      frame.focus({ preventScroll: true });
    } catch {}

    try {
      frameWindow?.focus();
    } catch {}

    let targets = [];

    try {
      if (frameWindow) {
        targets.push(frameWindow);
      }

      const frameDocument = frame.contentDocument;
      const canvas = frameDocument?.getElementById("canvas");

      if (canFocus(canvas)) {
        try {
          canvas.focus({ preventScroll: true });
        } catch {}

        targets.push(canvas);
      }

      if (frameDocument?.activeElement) {
        targets.push(frameDocument.activeElement);
      }

      if (frameDocument?.body) {
        targets.push(frameDocument.body);
      }

      if (frameDocument) {
        targets.push(frameDocument);
      }
    } catch {
      return false;
    }

    targets = [...new Set(targets)].filter(canDispatchEvents);

    const eventInit = {
      bubbles: true,
      cancelable: true,
      composed: true,
      view: frameWindow || window,
      key: descriptor.key,
      code: descriptor.code,
      keyCode: descriptor.keyCode,
      which: descriptor.keyCode,
      ctrlKey: descriptor.ctrlKey,
      altKey: descriptor.altKey,
      metaKey: descriptor.metaKey,
      shiftKey: descriptor.shiftKey,
    };

    for (const eventType of ["keydown", "keypress", "keyup"]) {
      for (const eventTarget of targets) {
        const keyboardEvent = new KeyboardEventConstructor(eventType, eventInit);

        try {
          Object.defineProperty(keyboardEvent, "keyCode", {
            configurable: true,
            get: () => descriptor.keyCode,
          });
          Object.defineProperty(keyboardEvent, "which", {
            configurable: true,
            get: () => descriptor.keyCode,
          });
        } catch {}

        eventTarget.dispatchEvent(keyboardEvent);
      }
    }

    return true;
  }

  function handleSkipIntroClick() {
    dismissSkipIntroButton();

    if (!skipIntro) {
      return;
    }

    setSkipIntroConsumed(true);
    setFrameSrc((currentSrc) => buildSkipIntroSaveSlotSrc(currentSrc, target, skipIntro.slot));
  }

  async function dispatchSyntheticKeypressSequence(keypressConfig) {
    const pressCount = Math.max(1, keypressConfig?.pressCount || 1);
    const pressIntervalMs = Math.max(0, keypressConfig?.pressIntervalMs || 0);

    for (let pressIndex = 0; pressIndex < pressCount; pressIndex += 1) {
      const dispatched = dispatchSyntheticKeypress(keypressConfig);

      if (!dispatched) {
        return;
      }

      if (pressIndex < pressCount - 1 && pressIntervalMs > 0) {
        await new Promise((resolve) => {
          window.setTimeout(resolve, pressIntervalMs);
        });
      }
    }
  }

  function handleTouchClickToggle() {
    const nextMode = touchClickMode === "left" ? "right" : "left";
    setTouchClickMode(nextMode);
    syncTouchClickModeToFrame(nextMode);
  }

  function handleControlMouseDown(event) {
    event.preventDefault();
  }

  function handleScummvmMenuClick() {
    void dispatchSyntheticKeypressSequence({
      key: "F5",
      code: "F5",
      keyCode: 116,
      ctrlKey: true,
    });
  }

  const FullscreenIcon = isFullscreen ? Minimize : Maximize;
  const fullscreenLabel = isFullscreen ? "Exit fullscreen" : "Enter fullscreen";
  const scummvmMenuLabel = "Open ScummVM menu";
  const showBootOverlay = !hasBootCompleted || hasBootFailed;
  const showBootProgress =
    typeof bootProgressValue === "number" &&
    Number.isFinite(bootProgressValue) &&
    typeof bootProgressMax === "number" &&
    Number.isFinite(bootProgressMax) &&
    bootProgressMax > 0;
  const bootProgressPercent = showBootProgress
    ? Math.max(0, Math.min(100, Math.round((bootProgressValue / bootProgressMax) * 100)))
    : null;
  const hasBootOverlayDismissed = !showBootOverlay;
  const showMobileOverlay =
    hasBootOverlayDismissed &&
    isMobileViewport &&
    (needsImmersiveRetry || !isLandscapeViewport);
  const mobileOverlayTitle = needsImmersiveRetry ? "Tap to continue" : "Rotate to landscape";
  const mobileOverlayBody = needsImmersiveRetry
    ? "Your browser needs one tap before scummweb can enter fullscreen on mobile."
    : "scummweb plays in landscape on mobile. Rotate your device to keep the game visible.";
  const showSkipIntroAction = showSkipIntroButton && skipIntro && hasBootCompleted && !hasBootFailed;
  const showExitControl =
    !skipIntro || hasBootFailed || showSkipIntroAction || touchControlsUnlocked || skipIntroConsumed;
  const showFullscreenControl = canFullscreen && hasBootPresentationCompleted;
  const showTouchClickToggle =
    isMobileViewport &&
    hasBootCompleted &&
    !hasBootFailed &&
    !showMobileOverlay &&
    touchControlsUnlocked;
  const showBottomActions = showSkipIntroAction;
  const touchClickToggleLabel =
    touchClickMode === "right"
      ? "Touch click mode: right click. Tap to switch to left click."
      : "Touch click mode: left click. Tap to switch to right click.";

  return (
    <div className="game-route-shell" ref={shellRef}>
      <div
        aria-hidden={showBootOverlay ? undefined : "true"}
        className={`game-route-boot-overlay ${showBootOverlay ? "is-visible" : "is-hidden"} ${
          hasBootFailed ? "is-error" : ""
        } ${game?.tone || "tone-default"}`}
        data-launch-overlay="true"
        data-launch-overlay-state={hasBootFailed ? "error" : showBootOverlay ? "visible" : "hidden"}
      >
        {game?.heroImage ? (
          <img
            alt=""
            className="game-route-boot-backdrop"
            decoding="async"
            fetchPriority="high"
            loading="eager"
            src={game.heroImage}
            style={getHeroImageStyle(game.heroImagePosition)}
          />
        ) : null}
        <div className="game-route-boot-scrim" />
        <div className="game-route-boot-content">
          <div className={`game-route-boot-card ${hasBootFailed ? "is-error" : ""}`}>
            {game?.eyebrow ? (
              <p className="game-route-boot-kicker">{game.eyebrow}</p>
            ) : null}
            <h1 className="game-route-boot-title">{game?.displayTitle || title}</h1>
            <div className="game-route-boot-meta">
              {game?.target ? <span>{game.target}</span> : null}
              {game?.year ? <span>{game.year}</span> : null}
              {game?.badge ? <span>{game.badge}</span> : null}
            </div>
            {game?.summary ? (
              <p className="game-route-boot-summary">{game.summary}</p>
            ) : null}
            <div className="game-route-boot-status-block">
              <p className="game-route-boot-status-label">
                {hasBootFailed ? "Launch failed" : "Launching"}
              </p>
              <p className="game-route-boot-status-text" data-launch-status="true">
                {bootStatusText}
              </p>
              {showBootProgress ? (
                <div className="game-route-boot-progress-shell">
                  <div className="game-route-boot-progress-track" aria-hidden="true">
                    <div
                      className="game-route-boot-progress-fill"
                      style={{ width: `${bootProgressPercent}%` }}
                    />
                  </div>
                  <span className="game-route-boot-progress-value">{bootProgressPercent}%</span>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </div>
      {showMobileOverlay ? (
        <div className="game-route-mobile-overlay" role="status" aria-live="polite">
          <div className="game-route-mobile-card">
            <p className="game-route-mobile-title">{mobileOverlayTitle}</p>
            <p className="game-route-mobile-copy">{mobileOverlayBody}</p>
            {needsImmersiveRetry ? (
              <button
                className="game-route-mobile-button"
                onClick={() => {
                  void handleImmersiveResume();
                }}
                type="button"
              >
                Continue
              </button>
            ) : null}
          </div>
        </div>
      ) : null}
      <div className="game-route-controls">
        {showExitControl ? (
          <div className="game-route-control-group is-left">
            <button
              aria-label="Exit game"
              className="game-route-control-button is-exit"
              onClick={handleExitClick}
              onMouseDown={handleControlMouseDown}
              title="Exit game"
              type="button"
            >
              <LogOut aria-hidden="true" size={17} strokeWidth={2} />
            </button>
          </div>
        ) : null}
        <div className="game-route-control-group is-right">
          {showTouchClickToggle ? (
            <>
              <button
                aria-label={touchClickToggleLabel}
                aria-pressed={touchClickMode === "right"}
                className="game-route-control-button is-touch-toggle"
                data-mode={touchClickMode}
                onClick={handleTouchClickToggle}
                onMouseDown={handleControlMouseDown}
                title={touchClickToggleLabel}
                type="button"
              >
                <TouchClickModeIcon mode={touchClickMode} />
              </button>
              {showFullscreenControl ? (
                <button
                  aria-label={fullscreenLabel}
                  className="game-route-control-button is-fullscreen"
                  onClick={handleFullscreenToggle}
                  onMouseDown={handleControlMouseDown}
                  title={fullscreenLabel}
                  type="button"
                >
                  <FullscreenIcon aria-hidden="true" size={18} strokeWidth={2} />
                </button>
              ) : null}
              {showScummvmMenuButton ? (
                <button
                  aria-label={scummvmMenuLabel}
                  className="game-route-control-button is-menu"
                  onClick={handleScummvmMenuClick}
                  onMouseDown={handleControlMouseDown}
                  title={scummvmMenuLabel}
                  type="button"
                >
                  <Menu aria-hidden="true" size={18} strokeWidth={2} />
                </button>
              ) : null}
            </>
          ) : (
            <>
              {showFullscreenControl ? (
                <button
                  aria-label={fullscreenLabel}
                  className="game-route-control-button is-fullscreen"
                  onClick={handleFullscreenToggle}
                  onMouseDown={handleControlMouseDown}
                  title={fullscreenLabel}
                  type="button"
                >
                  <FullscreenIcon aria-hidden="true" size={18} strokeWidth={2} />
                </button>
              ) : null}
              {showScummvmMenuButton ? (
                <button
                  aria-label={scummvmMenuLabel}
                  className="game-route-control-button is-menu"
                  onClick={handleScummvmMenuClick}
                  onMouseDown={handleControlMouseDown}
                  title={scummvmMenuLabel}
                  type="button"
                >
                  <Menu aria-hidden="true" size={18} strokeWidth={2} />
                </button>
              ) : null}
            </>
          )}
        </div>
      </div>
      {showBottomActions ? (
        <div className="game-route-bottom-actions">
          {showSkipIntroAction ? (
            <button
              className="game-route-skip-intro-button"
              onClick={handleSkipIntroClick}
              type="button"
            >
              Skip intro
            </button>
          ) : null}
        </div>
      ) : null}
      <iframe
        allow="autoplay; fullscreen"
        className="game-route-frame"
        data-scummvm-route-frame="true"
        data-scummvm-target={target}
        ref={frameRef}
        loading="eager"
        src={frameSrc}
        title={title}
      />
    </div>
  );
}
