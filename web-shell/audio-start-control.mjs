// A suspended audio clock can also stall movies. Resume it with a gesture
// that is consumed here, so starting audio does not skip a game's cutscene.
export function installAudioStartControl({ document, window, getAudioContext }) {
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = "Start audio";
  button.hidden = true;
  button.style.cssText = "position:fixed;bottom:3rem;left:50%;transform:translateX(-50%);z-index:1001;padding:.75rem 1.25rem;border:1px solid #f6e08a;border-radius:.4rem;background:#252015;color:#fff;font:bold 16px sans-serif;cursor:pointer";
  document.body.appendChild(button);

  const inputEvents = ["pointerdown", "pointerup", "mousedown", "mouseup", "touchstart", "touchend", "keydown", "keyup"];
  const heldKeys = new Set();
  const consumeInput = (event) => {
    const onButton = event.target === button;
    const key = event.code || event.key;
    if (event.type === "keydown") {
      if (onButton) heldKeys.add(key);
      else heldKeys.delete(key);
    }
    // Enter can resume audio and move focus before its key-up arrives.
    const releasedButtonKey = event.type === "keyup" && heldKeys.delete(key);
    if (onButton || releasedButtonKey) event.stopImmediatePropagation();
  };
  // Install before SDL registers its input handlers.
  for (const name of inputEvents) window.addEventListener(name, consumeInput, true);

  let context;
  let timer;
  const update = () => {
    button.hidden = context.state !== "suspended" && context.state !== "interrupted";
  };
  const watch = () => {
    context = getAudioContext();
    if (!context) {
      timer = window.setTimeout(watch, 250);
      return;
    }
    context.addEventListener("statechange", update);
    update();
  };
  button.addEventListener("click", async (event) => {
    event.stopPropagation();
    try {
      await context?.resume();
      document.getElementById("canvas")?.focus();
    } catch {
      button.textContent = "Try starting audio again";
    }
    if (context) update();
  });
  window.addEventListener("pagehide", () => {
    window.clearTimeout(timer);
    context?.removeEventListener("statechange", update);
    for (const name of inputEvents) window.removeEventListener(name, consumeInput, true);
  }, { once: true });
  watch();
  return button;
}
