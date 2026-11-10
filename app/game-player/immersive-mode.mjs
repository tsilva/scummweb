import { isKnownTvBrowser } from "../controller-device.mjs";

let launchEntry = null;
let pendingEntry = null;
let revision = 0;
let installedAppWindow = false;
let installedFullscreenRequest = null;

export function usesInstalledFullscreenFallback() {
  if (typeof window === "undefined") return false;
  // The display mode can change to fullscreen after the request succeeds.
  installedAppWindow ||= navigator.standalone === true ||
    Boolean(window.matchMedia?.("(display-mode: standalone), (display-mode: minimal-ui)").matches);
  return installedAppWindow;
}

function requestInstalledAppFullscreen() {
  if (installedFullscreenRequest) return installedFullscreenRequest;
  if (document.fullscreenElement || document.webkitFullscreenElement ||
      window.matchMedia?.("(display-mode: fullscreen)").matches ||
      navigator.userActivation?.isActive === false) return;

  const root = document.documentElement;
  const request = root.requestFullscreen || root.webkitRequestFullscreen;
  if (!request) return;

  installedFullscreenRequest = (async () => {
    try {
      await request.call(root);
    } catch {
      // The browser can refuse fullscreen. A later gesture can retry.
    }
  })().finally(() => { installedFullscreenRequest = null; });
  return installedFullscreenRequest;
}

export function observeInstalledFullscreenGestures(target) {
  if (!usesInstalledFullscreenFallback()) return;

  function onGesture(event) {
    if (event.isTrusted && event.key !== "Escape") void requestInstalledAppFullscreen();
  }

  // Let the app's controls use the gesture first, for example to open a file picker.
  target.addEventListener("click", onGesture);
  target.addEventListener("keydown", onGesture);
  return () => {
    target.removeEventListener("click", onGesture);
    target.removeEventListener("keydown", onGesture);
  };
}

export function isMobileClient() {
  if (typeof window === "undefined") return false;
  if (isKnownTvBrowser(navigator)) return false;
  return window.matchMedia?.("(pointer: coarse)").matches ||
    window.matchMedia?.("(max-width: 900px)").matches || navigator.maxTouchPoints > 0;
}

export function isTouchMobileClient() {
  if (typeof window === "undefined" || isKnownTvBrowser(navigator)) return false;
  return navigator.maxTouchPoints > 0 &&
    (/android|iphone|ipad|ipod|mobile/i.test(navigator.userAgent) ||
      (navigator.maxTouchPoints > 1 && /macintosh/i.test(navigator.userAgent)));
}

export function isGameFullscreen(shell) {
  const element = document.fullscreenElement || document.webkitFullscreenElement;
  return Boolean(element && (element === shell || element === document.documentElement));
}

export async function lockOrientation(orientation) {
  if (!isTouchMobileClient()) return;
  try {
    await screen.orientation?.lock?.(orientation);
  } catch {
    // Some mobile browsers do not support locking, or require fullscreen.
  }
}

export function enterImmersiveMode(shell) {
  const requestRevision = ++revision;
  pendingEntry = (async () => {
    if (!shell) return false;
    try {
      if (usesInstalledFullscreenFallback()) {
        await requestInstalledAppFullscreen();
      } else if (!isGameFullscreen(shell)) {
        const request = shell.requestFullscreen || shell.webkitRequestFullscreen;
        // Invoke before the first await to preserve the Play button's activation.
        if (request) await request.call(shell);
      }
    } catch {
      // Fullscreen refusal must never block the game or open another prompt.
    }
    if (requestRevision !== revision) return false;
    await lockOrientation("landscape");
    return isGameFullscreen(shell);
  })();
  return pendingEntry;
}

export function beginGameLaunch() {
  if (typeof window === "undefined" || (!isKnownTvBrowser(navigator) && !isTouchMobileClient())) return false;
  // The root survives client navigation; a launcher element would be removed.
  launchEntry = enterImmersiveMode(document.documentElement);
  return true;
}

export function resumeMobileGameLaunch(shell) {
  return launchEntry || enterImmersiveMode(shell);
}

export async function exitImmersiveMode() {
  const exitRevision = ++revision;
  const entry = pendingEntry;
  launchEntry = null;
  pendingEntry = null;
  // Finish an outstanding fullscreen request before leaving fullscreen.
  await entry;
  if (exitRevision !== revision) return;
  try {
    if (!usesInstalledFullscreenFallback() && (document.fullscreenElement || document.webkitFullscreenElement)) {
      const exit = document.exitFullscreen || document.webkitExitFullscreen;
      await exit?.call(document);
    }
  } catch {
    // Navigation remains available if the browser has already left fullscreen.
  }
  if (exitRevision === revision) await lockOrientation("portrait");
}
