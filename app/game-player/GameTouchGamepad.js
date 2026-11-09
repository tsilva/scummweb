import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { dispatchSyntheticKeypress, holdGameKey } from "./keyboard";

const up = { name: "Up", Icon: ArrowUp, key: { key: "ArrowUp", keyCode: 38 } };
const left = { name: "Left", Icon: ArrowLeft, key: { key: "ArrowLeft", keyCode: 37 } };
const right = { name: "Right", Icon: ArrowRight, key: { key: "ArrowRight", keyCode: 39 } };
const down = { name: "Down", Icon: ArrowDown, key: { key: "ArrowDown", keyCode: 40 } };
const directions = [up, left, right, down];

export function GameDirectionPad({ frameRef }) {
  return (
    <div aria-label="Movement" className="game-route-direction-pad" role="group">
      {directions.map(({ name, Icon, key }) => (
        <button
          aria-label={name}
          className="game-route-control-button is-gamepad"
          data-direction={name.toLowerCase()}
          key={name}
          onClick={() => dispatchSyntheticKeypress(frameRef.current, key)}
          type="button"
        >
          <Icon aria-hidden="true" size={20} />
        </button>
      ))}
    </div>
  );
}

function GameAxisStick({ axis, frameRef, label, negative, positive }) {
  const grip = useRef(null);
  const [offset, setOffset] = useState(0);

  useEffect(() => {
    const frame = frameRef.current;
    function reset() {
      grip.current?.release?.();
      grip.current = null;
      setOffset(0);
    }
    function handleVisibility() {
      if (document.hidden) reset();
    }
    function handleBlur() {
      // Moving focus into the canvas keeps this document active.
      if (!document.hasFocus()) reset();
    }
    frame?.addEventListener("load", reset);
    window.addEventListener("blur", handleBlur);
    window.addEventListener("pagehide", reset);
    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      grip.current?.release?.();
      grip.current = null;
      frame?.removeEventListener("load", reset);
      window.removeEventListener("blur", handleBlur);
      window.removeEventListener("pagehide", reset);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [frameRef]);

  const isVertical = axis === "y";
  const NegativeIcon = negative.Icon;
  const PositiveIcon = positive.Icon;

  function move(event) {
    const active = grip.current;
    if (event.pointerId !== active?.pointerId) return;
    const distance = (isVertical ? event.clientY : event.clientX) - active.center;
    const offset = Math.max(-active.travel, Math.min(active.travel, distance));
    setOffset(offset);
    const direction = Math.abs(distance) > active.travel * 0.25
      ? (distance < 0 ? negative : positive)
      : null;
    if (active.direction === direction) return;
    active.release?.();
    active.direction = direction;
    active.release = direction ? holdGameKey(frameRef.current, direction.key) : null;
  }

  function start(event) {
    if (event.button !== 0 || grip.current) return;
    event.preventDefault();
    const bounds = event.currentTarget.getBoundingClientRect();
    const size = isVertical ? bounds.height : bounds.width;
    event.currentTarget.setPointerCapture(event.pointerId);
    grip.current = {
      pointerId: event.pointerId,
      center: (isVertical ? bounds.top : bounds.left) + size / 2,
      travel: size * 0.27,
      direction: null,
    };
    move(event);
  }

  function stop(event) {
    if (event.pointerId !== grip.current?.pointerId) return;
    grip.current.release?.();
    grip.current = null;
    setOffset(0);
  }

  return (
    <div className="game-route-stick" role="group" aria-label={label}>
      <div
        className="game-route-stick-base"
        data-axis={axis}
        onLostPointerCapture={stop}
        onPointerCancel={stop}
        onPointerDown={start}
        onPointerMove={move}
        onPointerUp={stop}
      >
        <NegativeIcon className="game-route-stick-negative" aria-hidden="true" size={15} />
        <PositiveIcon className="game-route-stick-positive" aria-hidden="true" size={15} />
        <span
          className="game-route-stick-knob"
          style={{ transform: isVertical ? `translateY(${offset}px)` : `translateX(${offset}px)` }}
        />
      </div>
      <span aria-hidden="true">{label}</span>
    </div>
  );
}

const grimActions = [
  { key: { key: "Enter", keyCode: 13 }, label: "Use / Talk" },
  { key: "e", label: "Examine" },
  { key: "p", label: "Pick up / Put away" },
  { key: "i", label: "Inventory" },
];

export function GrimTouchGamepad({ frameRef }) {
  const [actionsOpen, setActionsOpen] = useState(false);
  const actionsId = useId();
  const actionsButton = useRef(null);

  return (
    <div className="game-route-grim-gamepad">
      <GameAxisStick axis="y" frameRef={frameRef} label="Walk" negative={up} positive={down} />
      <div className="game-route-grim-right">
        <div
          className="game-route-grim-actions"
          onKeyDown={(event) => {
            if (event.key !== "Escape" || !actionsOpen) return;
            event.preventDefault();
            event.stopPropagation();
            setActionsOpen(false);
            actionsButton.current?.focus();
          }}
        >
          <button
            aria-controls={actionsId}
            aria-expanded={actionsOpen}
            className="game-route-control-button is-gamepad"
            onClick={() => setActionsOpen(!actionsOpen)}
            onMouseDown={(event) => event.preventDefault()}
            ref={actionsButton}
            type="button"
          >
            Actions
          </button>
          <div aria-label="Game actions" className="game-route-grim-action-choices" hidden={!actionsOpen} id={actionsId} role="group">
            {grimActions.map(({ key, label }) => (
              <button
                className="game-route-control-button is-gamepad"
                key={label}
                onClick={() => {
                  setActionsOpen(false);
                  dispatchSyntheticKeypress(frameRef.current, key);
                }}
                onMouseDown={(event) => event.preventDefault()}
                type="button"
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        <GameAxisStick axis="x" frameRef={frameRef} label="Turn" negative={left} positive={right} />
      </div>
    </div>
  );
}
