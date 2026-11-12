import {
  ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Backpack, Eye, Footprints, Gauge,
  HandGrab, Info, MessageCircle, MoveDown, Target, Zap,
} from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { dispatchSyntheticKeypress, holdGameKey } from "./keyboard";
import { clickGameMouse } from "./game-mouse.mjs";

const up = { name: "Up", Icon: ArrowUp, key: { key: "ArrowUp", keyCode: 38 } };
const left = { name: "Left", Icon: ArrowLeft, key: { key: "ArrowLeft", keyCode: 37 } };
const right = { name: "Right", Icon: ArrowRight, key: { key: "ArrowRight", keyCode: 39 } };
const down = { name: "Down", Icon: ArrowDown, key: { key: "ArrowDown", keyCode: 40 } };
const directions = [up, left, right, down];
// ScummVM maps Castle Master's arrows to strafing; Z/X turn the camera.
const castleDirectionKeys = { Left: "z", Right: "x" };
const hugoDiagonals = {
  Up: {
    Left: { key: "7", code: "Numpad7", keyCode: 103 },
    Right: { key: "9", code: "Numpad9", keyCode: 105 },
  },
  Down: {
    Left: { key: "1", code: "Numpad1", keyCode: 97 },
    Right: { key: "3", code: "Numpad3", keyCode: 99 },
  },
};

function stopHugoWalk(active) {
  const key = active.hugoKey;
  active.hugoKey = null;
  active.hugoDirections = [];
  if (!key || active.frame?.contentDocument !== active.frameDocument) return;

  // Hugo toggles walking on each direction press and can stop on its own at an obstacle.
  // Switch directions first so the final two presses always start and then stop the same walk.
  const otherKey = key === up.key ? down.key : up.key;
  for (const stopKey of [otherKey, key, key]) {
    dispatchSyntheticKeypress(active.frame, stopKey, { focus: false });
  }
}

function releaseStick(grip) {
  const active = grip.current;
  if (!active) return;
  grip.current = null;
  if (active.hugoKey) stopHugoWalk(active);
  for (const release of active.held.values()) release();
}

function isAxisEngaged(value, crossAxis, travel, wasHeld) {
  // Keep a straight drag straight and let a held direction tolerate small thumb shifts.
  const deadZone = travel * (wasHeld ? 0.24 : 0.36);
  const diagonalThreshold = Math.abs(crossAxis) * (wasHeld ? 0.46 : 0.64);
  return Math.abs(value) > Math.max(deadZone, diagonalThreshold);
}

export function GameMovementStick({ frameRef, hugo = false, castle = false }) {
  const grip = useRef(null);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [activeDirections, setActiveDirections] = useState([]);

  useEffect(() => {
    const frame = frameRef.current;
    function reset() {
      releaseStick(grip);
      setOffset({ x: 0, y: 0 });
      setActiveDirections([]);
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
    const wasHeld = (direction) => hugo ? active.hugoDirections.includes(direction) : active.held.has(direction);
    if (isAxisEngaged(y, x, active.travel, wasHeld(vertical))) wanted.push(vertical);
    if (isAxisEngaged(x, y, active.travel, wasHeld(horizontal))) wanted.push(horizontal);
    // Freescape repeats one action at a time. Avoid leaving a held axis without
    // native repeat when the other axis is released.
    if (castle && wanted.length === 2) wanted.splice(Math.abs(x) > Math.abs(y) ? 0 : 1, 1);
    setActiveDirections(wanted);

    if (hugo) {
      const key = wanted.length === 2 ? hugoDiagonals[vertical.name][horizontal.name] : wanted[0]?.key;
      if (!key) {
        stopHugoWalk(active);
      } else if (key !== active.hugoKey && active.frame?.contentDocument === active.frameDocument &&
        dispatchSyntheticKeypress(active.frame, key)) {
        active.hugoKey = key;
        active.hugoDirections = wanted;
      }
      return;
    }

    for (const [direction, release] of active.held) {
      if (wanted.includes(direction)) continue;
      release();
      active.held.delete(direction);
    }
    for (const direction of wanted) {
      if (active.held.has(direction)) continue;
      // Keep a mobile drag in the host document. Focusing the iframe can cancel
      // its pointer capture before the held key has been registered for cleanup.
      const release = holdGameKey(frameRef.current,
        (castle && castleDirectionKeys[direction.name]) || direction.key, { focus: !castle });
      if (!release) continue;
      if (grip.current !== active) {
        release();
        return;
      }
      active.held.set(direction, release);
    }
  }

  function start(event) {
    if (event.button !== 0 || grip.current) return;
    event.preventDefault();
    const bounds = event.currentTarget.getBoundingClientRect();
    const travel = Math.min(bounds.width, bounds.height) * 0.27;
    if (!travel) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    const frame = frameRef.current;
    grip.current = {
      pointerId: event.pointerId,
      originX: event.clientX,
      originY: event.clientY,
      travel,
      held: new Map(),
      frame,
      frameDocument: frame?.contentDocument,
      hugoDirections: [],
    };
  }

  function stop(event) {
    if (grip.current?.pointerId !== event.pointerId) return;
    releaseStick(grip);
    setOffset({ x: 0, y: 0 });
    setActiveDirections([]);
  }

  return (
    <div
      aria-label={hugo ? "Movement" : "Walk and turn"}
      className="game-route-stick-base"
      onLostPointerCapture={stop}
      onPointerCancel={stop}
      onPointerDown={start}
      onPointerMove={move}
      onPointerUp={stop}
      role="group"
    >
      {directions.map(({ name, Icon }) => (
        <Icon
          key={name}
          data-direction={name.toLowerCase()}
          data-active={activeDirections.some((direction) => direction.name === name)}
          aria-hidden="true"
          size={15}
        />
      ))}
      <span
        className="game-route-stick-knob"
        style={{ transform: `translate(${offset.x}px, ${offset.y}px)` }}
      />
    </div>
  );
}

const grimActions = [
  { key: { key: "Enter", keyCode: 13 }, label: "Use / Talk", Icon: MessageCircle },
  { key: "e", label: "Examine", Icon: Eye },
  { key: "p", label: "Pick up / Put away", Icon: HandGrab },
  { key: "i", label: "Inventory", Icon: Backpack },
];

const castleActions = [
  { button: "right", label: "Use / Activate", Icon: HandGrab },
  { key: "0", label: "Throw rock", Icon: Target },
  { key: "p", label: "Look up", Icon: ArrowUp },
  { key: "l", label: "Look down", Icon: ArrowDown },
  { key: "f", label: "Face forward", Icon: Eye },
  { key: "w", label: "Walk", Icon: Footprints },
  { key: "r", label: "Run", Icon: Gauge },
  { key: "c", label: "Crawl", Icon: MoveDown },
  { key: "i", label: "Game information", Icon: Info },
];

export function GameTouchGamepad({ frameRef, mode = "grim" }) {
  const castle = mode === "castle";
  const [actionsOpen, setActionsOpen] = useState(false);
  const actionsId = useId();
  const actionsButton = useRef(null);

  return (
    <div className={`game-route-touch-gamepad game-route-grim-gamepad${castle ? " game-route-castle-gamepad" : ""}`}>
      <GameMovementStick frameRef={frameRef} castle={castle} />
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
          <Zap aria-hidden="true" size={20} />
        </button>
        <div aria-label="Game actions" className="game-route-grim-action-choices" hidden={!actionsOpen} id={actionsId} role="group">
          {(castle ? castleActions : grimActions).map(({ key, button, label, Icon }) => (
            <button
              aria-label={label}
              className="game-route-control-button is-gamepad"
              key={label}
              onClick={() => {
                setActionsOpen(false);
                if (button) clickGameMouse(frameRef.current, window.location.origin, button);
                else dispatchSyntheticKeypress(frameRef.current, key);
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
