// SDL looks up the physical key by KeyboardEvent.code, even for punctuation.
const commandCharacterCodes = {
  " ": "Space",
  "!": "Digit1", "@": "Digit2", "#": "Digit3", "$": "Digit4", "%": "Digit5",
  "^": "Digit6", "&": "Digit7", "*": "Digit8", "(": "Digit9", ")": "Digit0",
  "-": "Minus", _: "Minus", "=": "Equal", "+": "Equal",
  "[": "BracketLeft", "{": "BracketLeft", "]": "BracketRight", "}": "BracketRight",
  "\\": "Backslash", "|": "Backslash", ";": "Semicolon", ":": "Semicolon",
  "'": "Quote", '"': "Quote", ",": "Comma", "<": "Comma", ".": "Period", ">": "Period",
  "/": "Slash", "?": "Slash", "`": "Backquote", "~": "Backquote",
};

function getKeyboardDescriptor(input) {
  const options =
    typeof input === "string"
      ? { key: input }
      : input && typeof input === "object"
        ? input
        : {};
  const key = typeof options.key === "string" ? options.key : "";
  const normalizedKey = key === " " ? key : key.trim() || "Escape";

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

function focusFrameContent(frame) {
  if (!frame) {
    return false;
  }

  try {
    frame.contentWindow?.focus();
  } catch {}

  try {
    const frameDocument = frame.contentDocument;
    const canvas = frameDocument?.getElementById("canvas");

    if (canFocus(canvas)) {
      try {
        canvas.focus({ preventScroll: true });
      } catch {}

      if (frameDocument?.activeElement === canvas) {
        return true;
      }
    }

    if (canFocus(frameDocument?.body)) {
      try {
        frameDocument.body.focus({ preventScroll: true });
      } catch {}

      if (frameDocument?.activeElement === frameDocument.body) {
        return true;
      }
    }
  } catch {}

  return false;
}

export function dispatchSyntheticKeypress(frame, input) {
  if (!frame) {
    return false;
  }

  const descriptor = getKeyboardDescriptor(input);
  const frameWindow = frame.contentWindow;
  const KeyboardEventConstructor = frameWindow?.KeyboardEvent || window.KeyboardEvent;
  focusFrameContent(frame);

  let target;

  try {
    const frameDocument = frame.contentDocument;
    const canvas = frameDocument?.getElementById("canvas");
    // A single bubbling event reaches the canvas, document and window listeners.
    // Dispatching separately to those ancestors delivers the same press repeatedly.
    target = [canvas, frameDocument?.activeElement, frameDocument?.body, frameDocument, frameWindow]
      .find(canDispatchEvents);
  } catch {
    return false;
  }

  if (!target) {
    return false;
  }

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
    const charCode = eventType === "keypress" && descriptor.key.length === 1
      ? descriptor.key.charCodeAt(0) : 0;
    const keyboardEvent = new KeyboardEventConstructor(eventType, { ...eventInit, charCode });

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

    target.dispatchEvent(keyboardEvent);
  }

  return true;
}

export async function dispatchSyntheticKeypressSequence(frame, keypressConfig) {
  const pressCount = Math.max(1, keypressConfig?.pressCount || 1);
  const pressIntervalMs = Math.max(0, keypressConfig?.pressIntervalMs || 0);

  for (let pressIndex = 0; pressIndex < pressCount; pressIndex += 1) {
    const dispatched = dispatchSyntheticKeypress(frame, keypressConfig);

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

export function dispatchGameCommand(frame, command) {
  for (const key of command) {
    if (!dispatchSyntheticKeypress(frame, { key, code: commandCharacterCodes[key] })) return false;
  }
  return dispatchSyntheticKeypress(frame, { key: "Enter", keyCode: 13 });
}
