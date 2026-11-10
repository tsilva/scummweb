const directions = new Map([
  ["ArrowUp", [0, -1]], ["ArrowDown", [0, 1]], ["ArrowLeft", [-1, 0]], ["ArrowRight", [1, 0]],
]);
const rightClickHoldMs = 500;
const moveHoldDelayMs = 220;
const moveRepeatMs = 35;

function sendMouseInput(frame, origin, message) {
  try {
    frame?.contentWindow?.postMessage(message, origin);
  } catch {}
}

export function moveGameMouse(frame, origin, deltaX, deltaY) {
  sendMouseInput(frame, origin, { type: "scummweb-touch-cursor-pad", deltaX, deltaY });
}

export function clickGameMouse(frame, origin, button) {
  sendMouseInput(frame, origin, { type: "scummweb-touch-click", button: button === "right" ? "right" : "left" });
}

export function setGameMouseButton(frame, origin, button, pressed, cancelled = false) {
  sendMouseInput(frame, origin, { type: "scummweb-touch-button", button, pressed, cancelled });
}

export function observeRemotePlayerInput(host, frame) {
  const inputEvents = ["keydown", "keypress", "keyup"];
  const listenerOptions = { capture: true };
  let frameDocument;
  let clickPress = null;
  let blurTimer;
  let moveTimer;
  const heldDirections = new Set();

  function stopMoving() {
    host.clearTimeout(moveTimer);
    moveTimer = undefined;
    heldDirections.clear();
  }

  function resetInput() {
    stopMoving();
    clickPress = null;
  }

  function repeatMove() {
    if (!host.document.hasFocus()) {
      resetInput();
      return;
    }
    let x = 0;
    let y = 0;
    for (const key of heldDirections) {
      const [dx, dy] = directions.get(key);
      x += dx;
      y += dy;
    }
    if (x || y) moveGameMouse(frame, host.location.origin, x * 12, y * 12);
    moveTimer = host.setTimeout(repeatMove, moveRepeatMs);
  }

  function onBlur() {
    // Moving focus between the page and its game iframe keeps the page active.
    host.clearTimeout(blurTimer);
    blurTimer = host.setTimeout(() => {
      if (!host.document.hasFocus()) resetInput();
    }, 0);
  }

  function onVisibilityChange() {
    if (host.document.hidden) resetInput();
  }

  function onKey(event) {
    const direction = directions.get(event.key);
    if (event.type === "keyup" && direction) {
      heldDirections.delete(event.key);
      if (!heldDirections.size) stopMoving();
    }
    if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey ||
      event.target?.isContentEditable || event.target?.closest?.("input, select, textarea")) {
      if (event.type === "keyup" && event.key === "Enter") clickPress = null;
      return;
    }

    if (event.target?.closest?.("a[href], button") || (!direction && event.key !== "Enter")) {
      if (event.type === "keyup" && event.key === "Enter") clickPress = null;
      return;
    }

    event.preventDefault();
    event.stopImmediatePropagation();
    if (direction) {
      if (event.type === "keydown" && !event.repeat && !heldDirections.has(event.key)) {
        heldDirections.add(event.key);
        moveGameMouse(frame, host.location.origin, direction[0] * 7, direction[1] * 7);
        moveTimer ??= host.setTimeout(repeatMove, moveHoldDelayMs);
      }
    } else if (event.type === "keydown") {
      // Android can send another keydown during a hold with repeat still false.
      if (clickPress) clickPress.repeated = true;
      else if (!event.repeat) clickPress = { started: host.performance.now(), repeated: false };
    } else if (event.type === "keyup" && clickPress) {
      const press = clickPress;
      clickPress = null;
      const held = press.repeated || host.performance.now() - press.started >= rightClickHoldMs;
      clickGameMouse(frame, host.location.origin, held ? "right" : "left");
    }
  }

  function detachFrame() {
    for (const type of inputEvents) frameDocument?.removeEventListener(type, onKey, listenerOptions);
    frameDocument?.defaultView?.removeEventListener("blur", onBlur);
  }

  function attachFrame() {
    detachFrame();
    resetInput();
    frameDocument = frame?.contentDocument;
    for (const type of inputEvents) frameDocument?.addEventListener(type, onKey, listenerOptions);
    frameDocument?.defaultView?.addEventListener("blur", onBlur);
  }

  for (const type of inputEvents) host.addEventListener(type, onKey, listenerOptions);
  host.addEventListener("blur", onBlur);
  host.document.addEventListener("visibilitychange", onVisibilityChange);
  frame?.addEventListener("load", attachFrame);
  attachFrame();
  return () => {
    for (const type of inputEvents) host.removeEventListener(type, onKey, listenerOptions);
    host.removeEventListener("blur", onBlur);
    host.document.removeEventListener("visibilitychange", onVisibilityChange);
    frame?.removeEventListener("load", attachFrame);
    detachFrame();
    host.clearTimeout(blurTimer);
    resetInput();
  };
}
