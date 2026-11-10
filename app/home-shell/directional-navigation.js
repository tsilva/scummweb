"use client";

import { useEffect } from "react";
import { isKnownTvBrowser, isTvBrowser } from "../controller-device.mjs";
import { enterImmersiveMode } from "../game-player/immersive-mode.mjs";
import { directionalNeighbor } from "./directional-neighbor.mjs";

const controls = "a[href], button, summary";
const directions = ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"];

function isAvailable(element) {
  return !element.matches(":disabled, [aria-disabled=true]") &&
    !element.closest("[hidden], [inert], [aria-hidden=true], [data-ready=false]") &&
    element.getClientRects().length > 0 && getComputedStyle(element).visibility === "visible";
}

export function focusDirectionalControl(element) {
  const previous = document.activeElement;
  element.focus({ preventScroll: true });
  if (document.activeElement !== element) return;

  const topControls = element.closest(".dashboard-nav-home, .install-prompt");
  const returningToHero = element.closest(".hero-stage") &&
    previous?.closest(".game-screenshots, .section-stack");
  // A visible control can still leave most of the hero above the viewport.
  if (returningToHero || (topControls && !topControls.contains(previous))) {
    window.scrollTo({ top: 0, behavior: "instant" });
  } else {
    element.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "instant" });
  }
}

export function focusHeroAction() {
  const launch = document.querySelector(".hero-actions:not(.hero-initial-actions):not([data-ready])");
  const action = [...(launch?.querySelectorAll(".launch-button, .browse-games-button") ?? [])].find(isAvailable);
  if (action) focusDirectionalControl(action);
  return Boolean(action);
}

function position(element) {
  const { left, right, top, bottom } = element.getBoundingClientRect();
  // Place the fixed header above the page content for directional comparisons.
  const offset = element.closest(".dashboard-nav") ? window.scrollY : 0;
  return { left, right, top: top - offset, bottom: bottom - offset };
}

export default function DirectionalNavigation({ initialFocus, onResumeGame }) {
  useEffect(() => {
    const root = document.documentElement;
    let active = true;
    let observer;
    let introFrame;
    let frame = 0;
    let previous = [];
    let repeatAt = 0;
    let landingFullscreenAttempted = false;

    function activate() {
      root.dataset.dpadNavigation = "";
    }

    function startNavigation() {
      if (!active) return;
      activate();
      if (initialFocus === "toolbar") {
        const exit = document.querySelector(".game-route-control-button.is-exit");
        if (exit && isAvailable(exit)) focusDirectionalControl(exit);
        return;
      }
      if (initialFocus === "skip-intro") {
        const button = document.querySelector(".game-route-skip-intro-button");
        const player = button?.closest(".game-route-shell");
        const iframe = player?.querySelector("iframe[data-scummvm-route-frame]");
        if (button && isAvailable(button) && (document.activeElement === document.body || document.activeElement === iframe)) {
          introFrame = iframe;
          focusDirectionalControl(button);
        }
        return;
      }
      if (initialFocus !== "play" || (location.hash && !location.hash.startsWith("#slide="))) return;
      const tryFocus = () => {
        if (document.activeElement !== document.body || focusHeroAction()) observer?.disconnect();
      };
      const launch = document.querySelector(".hero-launch");
      if (!launch) return;
      observer?.disconnect();
      observer = new MutationObserver(tryFocus);
      observer.observe(launch, { childList: true, attributes: true, subtree: true });
      tryFocus();
    }

    function move(direction) {
      const modal = document.querySelector("dialog:modal");
      if (!modal && initialFocus === "toolbar" && (direction === "ArrowDown" || direction === "Escape")) {
        onResumeGame();
        return;
      }
      const scope = modal ?? (initialFocus === "toolbar" ? document.querySelector(".game-route-controls") : document);
      if (!scope) return;
      const current = document.activeElement;
      if (!scope.contains(current) || current === document.body) {
        if (scope === document && focusHeroAction()) return;
        const first = [...scope.querySelectorAll(controls)].find(isAvailable);
        if (first) focusDirectionalControl(first);
        return;
      }
      const candidates = [...scope.querySelectorAll(controls)]
        .filter((element) => element !== current && isAvailable(element));
      const index = directionalNeighbor(position(current), candidates.map(position), direction);
      if (index !== -1) focusDirectionalControl(candidates[index]);
    }

    function onKeyDown(event) {
      if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey ||
        event.target.isContentEditable || event.target.closest?.("input, textarea, select")) return;
      const directionalKey = directions.includes(event.key);
      if (initialFocus === "play" && !landingFullscreenAttempted && event.isTrusted &&
        isKnownTvBrowser(navigator) && (directionalKey ||
          (event.key === "Enter" && !event.target.closest?.(".launch-button, .start-fresh-button")))) {
        landingFullscreenAttempted = true;
        void enterImmersiveMode(root);
      }
      if (!directionalKey && !(initialFocus === "toolbar" && event.key === "Escape" &&
          !event.target.closest?.("dialog:modal"))) return;
      if (!root.hasAttribute("data-dpad-navigation") && !event.target.matches?.(controls)) return;
      event.preventDefault();
      activate();
      move(event.key);
    }

    function onLibraryLink(event) {
      if (event.detail !== 0 || !root.hasAttribute("data-dpad-navigation") ||
        !event.target.closest?.('a[href="#library"]')) return;
      requestAnimationFrame(() => {
        const card = [...document.querySelectorAll("#library a.poster-card")].find(isAvailable);
        if (active && card) focusDirectionalControl(card);
      });
    }

    function onFullscreenChange() {
      if (initialFocus !== "play" || !isKnownTvBrowser(navigator)) return;
      requestAnimationFrame(() => {
        if (!active || !document.activeElement?.closest(".hero-launch")) return;
        // Chrome can scroll to retain the focused button when its address bar moves.
        const bottom = document.activeElement.getBoundingClientRect().bottom + window.scrollY;
        if (bottom <= window.innerHeight - 8) window.scrollTo({ top: 0, behavior: "instant" });
      });
    }

    function pollGamepad(now) {
      frame = 0;
      const pad = [...navigator.getGamepads()].find((device) => device?.mapping === "standard");
      if (!pad || document.hidden) {
        previous = [];
        return;
      }
      const pressed = [12, 13, 14, 15, 0].map((index) => Boolean(pad.buttons[index]?.pressed));
      const direction = pressed.findIndex((down, index) => down && index < directions.length);
      if (direction !== -1 && (!previous[direction] || now >= repeatAt)) {
        move(directions[direction]);
        repeatAt = now + (previous[direction] ? 130 : 350);
      }
      const focused = document.activeElement;
      if (pressed[4] && !previous[4] && focused.matches("a[href], button") && isAvailable(focused)) focused.click();
      previous = pressed;
      frame = requestAnimationFrame(pollGamepad);
    }

    function onGamepad() {
      if (frame || document.hidden) return;
      const pad = navigator.getGamepads?.().find((device) => device?.mapping === "standard");
      if (!pad) return;
      // A held launch button must not also activate Skip intro when it appears.
      if (initialFocus === "skip-intro") previous[4] = Boolean(pad.buttons[0]?.pressed);
      startNavigation();
      frame = requestAnimationFrame(pollGamepad);
    }

    void isTvBrowser(navigator).then((isTv) => { if (isTv) startNavigation(); });

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("gamepadconnected", onGamepad);
    document.addEventListener("visibilitychange", onGamepad);
    document.addEventListener("fullscreenchange", onFullscreenChange);
    document.addEventListener("click", onLibraryLink);
    onGamepad();
    return () => {
      active = false;
      observer?.disconnect();
      cancelAnimationFrame(frame);
      if (introFrame?.isConnected && document.activeElement === document.body) {
        introFrame.focus({ preventScroll: true });
      }
      delete root.dataset.dpadNavigation;
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("gamepadconnected", onGamepad);
      document.removeEventListener("visibilitychange", onGamepad);
      document.removeEventListener("fullscreenchange", onFullscreenChange);
      document.removeEventListener("click", onLibraryLink);
    };
  }, [initialFocus, onResumeGame]);

  return null;
}
