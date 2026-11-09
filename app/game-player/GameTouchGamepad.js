import {
  ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Backpack, Ellipsis, Eye, HandGrab, MessageCircle,
} from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { dispatchSyntheticKeypress, holdGameKey } from "./keyboard";

const up = { name: "Up", Icon: ArrowUp, key: { key: "ArrowUp", keyCode: 38 } };
const left = { name: "Left", Icon: ArrowLeft, key: { key: "ArrowLeft", keyCode: 37 } };
const right = { name: "Right", Icon: ArrowRight, key: { key: "ArrowRight", keyCode: 39 } };
const down = { name: "Down", Icon: ArrowDown, key: { key: "ArrowDown", keyCode: 40 } };
const directions = [up, left, right, down];

function releaseStick(grip) {
  for (const release of grip.current?.held.values() ?? []) release();
  grip.current = null;
}

function isAxisEngaged(value, crossAxis, travel, wasHeld) {
  // Keep a straight drag straight and let a held direction tolerate small thumb shifts.
  const deadZone = travel * (wasHeld ? 0.24 : 0.36);
  const diagonalThreshold = Math.abs(crossAxis) * (wasHeld ? 0.46 : 0.64);
  return Math.abs(value) > Math.max(deadZone, diagonalThreshold);
}

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

function GrimMovementStick({ frameRef }) {
  const grip = useRef(null);
  const [offset, setOffset] = useState({ x: 0, y: 0 });

  useEffect(() => {
    const frame = frameRef.current;
    function reset() {
      releaseStick(grip);
      setOffset({ x: 0, y: 0 });
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
      releaseStick(grip);
      frame?.removeEventListener("load", reset);
      window.removeEventListener("blur", handleBlur);
      window.removeEventListener("pagehide", reset);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [frameRef]);

  function move(event) {
    const active = grip.current;
    if (!active || event.pointerId !== active.pointerId) return;
    const dx = event.clientX - active.originX;
    const dy = event.clientY - active.originY;
    const scale = active.travel / Math.max(active.travel, Math.hypot(dx, dy));
    const x = dx * scale;
    const y = dy * scale;
    setOffset({ x, y });

    const vertical = y < 0 ? up : down;
    const horizontal = x < 0 ? left : right;
    const wanted = [];
    if (isAxisEngaged(y, x, active.travel, active.held.has(vertical))) wanted.push(vertical);
    if (isAxisEngaged(x, y, active.travel, active.held.has(horizontal))) wanted.push(horizontal);

    for (const [direction, release] of active.held) {
      if (wanted.includes(direction)) continue;
      release();
      active.held.delete(direction);
    }
    for (const direction of wanted) {
      if (active.held.has(direction)) continue;
      const release = holdGameKey(frameRef.current, direction.key);
      if (release) active.held.set(direction, release);
    }
  }

  function start(event) {
    if (event.button !== 0 || grip.current) return;
    event.preventDefault();
    const bounds = event.currentTarget.getBoundingClientRect();
    const travel = Math.min(bounds.width, bounds.height) * 0.27;
    if (!travel) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    grip.current = {
      pointerId: event.pointerId,
      originX: event.clientX,
      originY: event.clientY,
      travel,
      held: new Map(),
    };
  }

  function stop(event) {
    if (grip.current?.pointerId !== event.pointerId) return;
    releaseStick(grip);
    setOffset({ x: 0, y: 0 });
  }

  return (
    <div className="game-route-stick" role="group" aria-label="Walk and turn">
      <div
        className="game-route-stick-base"
        onLostPointerCapture={stop}
        onPointerCancel={stop}
        onPointerDown={start}
        onPointerMove={move}
        onPointerUp={stop}
      >
        {directions.map(({ name, Icon }) => (
          <Icon key={name} data-direction={name.toLowerCase()} aria-hidden="true" size={15} />
        ))}
        <span
          className="game-route-stick-knob"
          style={{ transform: `translate(${offset.x}px, ${offset.y}px)` }}
        />
      </div>
      <span aria-hidden="true">Walk / Turn</span>
    </div>
  );
}

const grimActions = [
  { key: { key: "Enter", keyCode: 13 }, label: "Use / Talk", Icon: MessageCircle },
  { key: "e", label: "Examine", Icon: Eye },
  { key: "p", label: "Pick up / Put away", Icon: HandGrab },
  { key: "i", label: "Inventory", Icon: Backpack },
];

export function GrimTouchGamepad({ frameRef }) {
  const [actionsOpen, setActionsOpen] = useState(false);
  const actionsId = useId();
  const actionsButton = useRef(null);

  return (
    <div className="game-route-grim-gamepad">
      <GrimMovementStick frameRef={frameRef} />
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
          aria-label="Actions"
          className="game-route-control-button is-gamepad"
          onClick={() => setActionsOpen(!actionsOpen)}
          onMouseDown={(event) => event.preventDefault()}
          ref={actionsButton}
          title="Actions"
          type="button"
        >
          <Ellipsis aria-hidden="true" size={20} />
        </button>
        <div aria-label="Game actions" className="game-route-grim-action-choices" hidden={!actionsOpen} id={actionsId} role="group">
          {grimActions.map(({ key, label, Icon }) => (
            <button
              aria-label={label}
              className="game-route-control-button is-gamepad"
              key={label}
              onClick={() => {
                setActionsOpen(false);
                dispatchSyntheticKeypress(frameRef.current, key);
              }}
              onMouseDown={(event) => event.preventDefault()}
              title={label}
              type="button"
            >
              <Icon aria-hidden="true" size={20} />
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
