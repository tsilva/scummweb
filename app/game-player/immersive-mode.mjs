import { isKnownTvBrowser } from "../controller-device.mjs";

let launchEntry = null;
let pendingEntry = null;
let revision = 0;

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

async function lockOrientation(orientation) {
  try {
    await screen.orientation?.lock?.(orientation);
  } catch {
    // Some mobile browsers do not support locking, or require fullscreen.
  }
}

export function unlockOrientation() {
  try { screen.orientation?.unlock?.(); } catch {}
}

export function enterImmersiveMode(shell) {
  const requestRevision = ++revision;
  pendingEntry = (async () => {
    if (!shell) return false;
    try {
      if (!isGameFullscreen(shell)) {
        const request = shell.requestFullscreen || shell.webkitRequestFullscreen;
        // Invoke before the first await to preserve the Play button's activation.
        if (request) await request.call(shell);
      }
    } catch {
      // Fullscreen refusal must never block the game or open another prompt.
    }
    if (requestRevision !== revision) return false;
    if (isTouchMobileClient()) await lockOrientation("landscape");
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
  ++revision;
  const entry = pendingEntry;
  launchEntry = null;
  pendingEntry = null;
  // Finish an outstanding fullscreen request before restoring orientation.
  await entry;
  if (isTouchMobileClient()) await lockOrientation("portrait");
  try {
    if (document.fullscreenElement || document.webkitFullscreenElement) {
      const exit = document.exitFullscreen || document.webkitExitFullscreen;
      await exit?.call(document);
    }
  } catch {
    // Navigation remains available if the browser has already left fullscreen.
  } finally {
    unlockOrientation();
  }
}
