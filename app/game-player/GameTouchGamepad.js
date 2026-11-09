import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { dispatchSyntheticKeypress, holdGameKey } from "./keyboard";

const directions = [
  { name: "Up", Icon: ArrowUp, keyCode: 38 },
  { name: "Left", Icon: ArrowLeft, keyCode: 37 },
  { name: "Right", Icon: ArrowRight, keyCode: 39 },
  { name: "Down", Icon: ArrowDown, keyCode: 40 },
];

export function GameDirectionPad({ frameRef, hold }) {
  const presses = useRef(new Map());
  const [pressed, setPressed] = useState([]);

  useEffect(() => {
    const frame = frameRef.current;
    const activePresses = presses.current;
    function releaseAll() {
      for (const { release } of activePresses.values()) release();
      activePresses.clear();
    }
    function reset() {
      releaseAll();
      setPressed([]);
    }
    function handleVisibility() {
      if (document.hidden) reset();
    }
    function handleWindowBlur() {
      // Focusing the canvas moves focus into the iframe, keeping the page active.
      if (!document.hasFocus()) reset();
    }
    frame?.addEventListener("load", reset);
    window.addEventListener("blur", handleWindowBlur);
    window.addEventListener("pagehide", reset);
    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      releaseAll();
      frame?.removeEventListener("load", reset);
      window.removeEventListener("blur", handleWindowBlur);
      window.removeEventListener("pagehide", reset);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [frameRef, hold]);

  function press(event, direction, key) {
    if (!hold || event.button !== 0) return;
    event.preventDefault();
    if (presses.current.has(direction)) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    const release = holdGameKey(frameRef.current, key);
    if (!release) return;
    presses.current.set(direction, { pointerId: event.pointerId, release });
    setPressed([...presses.current.keys()]);
  }

  function release(event, direction) {
    const press = presses.current.get(direction);
    if (press?.pointerId !== event.pointerId) return;
    presses.current.delete(direction);
    press.release();
    setPressed([...presses.current.keys()]);
  }

  return (
    <div aria-label="Movement" className="game-route-direction-pad" role="group">
      {directions.map(({ name, Icon, keyCode }) => {
        const key = { key: `Arrow${name}`, keyCode };
        return (
          <button
            aria-label={name}
            className="game-route-control-button is-gamepad"
            data-direction={name.toLowerCase()}
            data-held={pressed.includes(name) || undefined}
            key={name}
            onClick={(event) => {
              if (!hold || event.detail === 0) dispatchSyntheticKeypress(frameRef.current, key);
            }}
            onLostPointerCapture={(event) => release(event, name)}
            onPointerCancel={(event) => release(event, name)}
            onPointerDown={(event) => press(event, name, key)}
            onPointerUp={(event) => release(event, name)}
            type="button"
          >
            <Icon aria-hidden="true" size={20} />
          </button>
        );
      })}
    </div>
  );
}

const grimActions = [
  { key: { key: "Enter", keyCode: 13 }, label: "Use / Talk" },
  { key: "e", label: "Examine" },
  { key: "p", label: "Pick up / Put away" },
  { key: "i", label: "Inventory" },
];

export function GrimTouchActions({ frameRef }) {
  return (
    <div aria-label="Game actions" className="game-route-grim-actions" role="group">
      {grimActions.map(({ key, label }) => (
        <button
          aria-label={label}
          className="game-route-control-button is-gamepad"
          key={label}
          onClick={() => dispatchSyntheticKeypress(frameRef.current, key)}
          onMouseDown={(event) => event.preventDefault()}
          type="button"
        >
          {label}
        </button>
      ))}
    </div>
  );
}
