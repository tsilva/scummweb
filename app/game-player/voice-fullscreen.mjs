// A permission prompt can leave fullscreen and consume the original gesture.
// Keep recovery scoped to voice input that began in the fullscreen player.
export function observeVoiceFullscreen(host, { shell, frame, enterFullscreen }) {
  const document = host.document;
  let target = null;
  let ready = false;
  let requesting = false;
  let suspended = false;
  let frameDocument;
  const fullscreenElement = () => document.fullscreenElement || document.webkitFullscreenElement;
  const clear = () => { target = null; ready = false; };

  async function resume() {
    if (!target || !ready || requesting || suspended || document.hidden) return;
    if (fullscreenElement()) { clear(); return; }
    const requestedTarget = target;
    requesting = true;
    try {
      // Invoke synchronously when reached from a new pointer/key gesture.
      await enterFullscreen(requestedTarget);
      if (target === requestedTarget && fullscreenElement()) clear();
    } catch {
      // A browser may require a fresh gesture after dismissing its prompt.
    } finally {
      requesting = false;
    }
  }

  function settled() {
    ready = true;
    void resume();
  }

  function returned() {
    suspended = false;
    settled();
  }

  function gesture(event) {
    if (!event.isTrusted) return;
    if (event.key === "Escape" || event.target?.closest?.(".is-exit, .is-menu, .is-fullscreen")) {
      clear();
      return;
    }
    // Releasing the original hold may precede the permission UI's exit.
    if (fullscreenElement()) return;
    returned();
  }

  const events = ["pointerdown", "pointerup", "keydown", "click"];
  function listenGestures(owner, add) {
    for (const type of events) owner?.[add ? "addEventListener" : "removeEventListener"](type, gesture, true);
  }
  function attachFrame() {
    listenGestures(frameDocument, false);
    frameDocument = frame?.contentDocument;
    listenGestures(frameDocument, true);
  }
  function visible() { if (!document.hidden) returned(); }
  function fullscreenChanged() { if (fullscreenElement()) clear(); else void resume(); }

  host.addEventListener("focus", returned);
  document.addEventListener("visibilitychange", visible);
  document.addEventListener("fullscreenchange", fullscreenChanged);
  document.addEventListener("webkitfullscreenchange", fullscreenChanged);
  listenGestures(document, true);
  frame?.addEventListener("load", attachFrame);
  attachFrame();

  return {
    arm() {
      const element = fullscreenElement();
      if (element && (element === shell || element === document.documentElement)) target = element;
      ready = false;
    },
    settled,
    returned,
    suspend() { suspended = true; },
    clear,
    dispose() {
      clear();
      host.removeEventListener("focus", returned);
      document.removeEventListener("visibilitychange", visible);
      document.removeEventListener("fullscreenchange", fullscreenChanged);
      document.removeEventListener("webkitfullscreenchange", fullscreenChanged);
      listenGestures(document, false);
      listenGestures(frameDocument, false);
      frame?.removeEventListener("load", attachFrame);
    },
  };
}
