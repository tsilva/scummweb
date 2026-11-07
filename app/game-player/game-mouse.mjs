const directions = new Map([
  ["ArrowUp", [0, -1]], ["ArrowDown", [0, 1]], ["ArrowLeft", [-1, 0]], ["ArrowRight", [1, 0]],
]);
const rightClickHoldMs = 500;

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

export function observeRemoteMouse(host, frame) {
  const inputEvents = ["keydown", "keypress", "keyup"];
  let frameDocument;
  let clickPress = null;
  const heldDirections = new Set();

  function onKey(event) {
    if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey ||
      event.target?.isContentEditable || event.target?.closest?.("a[href], button, input, select, textarea")) return;
    const direction = directions.get(event.key);
    if (!direction && event.key !== "Enter") return;

    event.preventDefault();
    event.stopImmediatePropagation();
    if (direction) {
      if (event.type === "keydown") {
        const step = event.repeat || heldDirections.has(event.key) ? 18 : 7;
        heldDirections.add(event.key);
        moveGameMouse(frame, host.location.origin, direction[0] * step, direction[1] * step);
      } else if (event.type === "keyup") {
        heldDirections.delete(event.key);
      }
    } else if (event.type === "keydown") {
      // Android can send another keydown during a hold with repeat still false.
      if (clickPress) clickPress.repeated = true;
      else if (!event.repeat) clickPress = { started: event.timeStamp, repeated: false };
    } else if (event.type === "keyup" && clickPress) {
      const held = clickPress.repeated || event.timeStamp - clickPress.started >= rightClickHoldMs;
      clickPress = null;
      clickGameMouse(frame, host.location.origin, held ? "right" : "left");
    }
  }

  function detachFrame() {
    for (const type of inputEvents) frameDocument?.removeEventListener(type, onKey, true);
  }

  function attachFrame() {
    detachFrame();
    clickPress = null;
    heldDirections.clear();
    frameDocument = frame.contentDocument;
    for (const type of inputEvents) frameDocument?.addEventListener(type, onKey, true);
  }

  for (const type of inputEvents) host.addEventListener(type, onKey, true);
  frame.addEventListener("load", attachFrame);
  attachFrame();
  return () => {
    for (const type of inputEvents) host.removeEventListener(type, onKey, true);
    frame.removeEventListener("load", attachFrame);
    detachFrame();
  };
}
