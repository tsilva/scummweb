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

export function observeRemoteMouse(host, frame, onOpenToolbar) {
  const inputEvents = ["keydown", "keypress", "keyup"];
  const listenerOptions = { capture: true };
  let frameDocument;
  let clickPress = null;
  let cursorAtTop = false;
  const heldDirections = new Set();

  function onMouseMove(event) {
    if (event.target?.id === "canvas") {
      cursorAtTop = event.clientY <= event.target.getBoundingClientRect().top + 1;
    }
  }

  function onKey(event) {
    if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey ||
      event.target?.isContentEditable || event.target?.closest?.("a[href], button, input, select, textarea")) return;
    const direction = directions.get(event.key);
    if (!direction && event.key !== "Enter") return;

    event.preventDefault();
    event.stopImmediatePropagation();
    if (direction) {
      if (event.type === "keydown") {
        const held = event.repeat || heldDirections.has(event.key);
        heldDirections.add(event.key);
        if (onOpenToolbar && cursorAtTop && event.key === "ArrowUp" && !held) {
          onOpenToolbar();
          return;
        }
        const step = held ? 18 : 7;
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
    for (const type of inputEvents) frameDocument?.removeEventListener(type, onKey, listenerOptions);
    frameDocument?.removeEventListener("mousemove", onMouseMove, listenerOptions);
  }

  function attachFrame() {
    detachFrame();
    clickPress = null;
    cursorAtTop = false;
    heldDirections.clear();
    frameDocument = frame.contentDocument;
    for (const type of inputEvents) frameDocument?.addEventListener(type, onKey, listenerOptions);
    frameDocument?.addEventListener("mousemove", onMouseMove, listenerOptions);
  }

  for (const type of inputEvents) host.addEventListener(type, onKey, listenerOptions);
  frame.addEventListener("load", attachFrame);
  attachFrame();
  return () => {
    for (const type of inputEvents) host.removeEventListener(type, onKey, listenerOptions);
    frame.removeEventListener("load", attachFrame);
    detachFrame();
  };
}
