import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, CornerUpLeft, CornerUpRight, MousePointer2, Move, RotateCcw } from "lucide-react";
import { useEffect, useRef } from "react";
import { dispatchSyntheticKeypress, holdGameKey } from "./keyboard";

const stepForward = { label: "Step forward", Icon: ArrowUp, key: "ArrowUp", keyCode: 38, position: "top" };

// Kyra uses Home/Page Up to turn and arrows to move.
const sixWayDirections = [
  { label: "Turn left", Icon: CornerUpLeft, key: "Home", keyCode: 36, position: "upper-left" },
  stepForward,
  { label: "Turn right", Icon: CornerUpRight, key: "PageUp", keyCode: 33, position: "upper-right" },
  { label: "Sidestep left", Icon: ArrowLeft, key: "ArrowLeft", keyCode: 37, position: "lower-left" },
  { label: "Step back", Icon: ArrowDown, key: "ArrowDown", keyCode: 40, position: "bottom" },
  { label: "Sidestep right", Icon: ArrowRight, key: "ArrowRight", keyCode: 39, position: "lower-right" },
];

// The AGOS dungeon games use the arrows for forward movement and all three turns.
const fourWayDirections = [
  { label: "Turn left", Icon: CornerUpLeft, key: "ArrowLeft", keyCode: 37, position: "left" },
  stepForward,
  { label: "Turn right", Icon: CornerUpRight, key: "ArrowRight", keyCode: 39, position: "right" },
  { label: "Turn around", Icon: RotateCcw, key: "ArrowDown", keyCode: 40, position: "bottom" },
];

function DungeonWalkPad({ frameRef, layout }) {
  const releasePendingKey = useRef(null);
  const directions = layout === "four-way" ? fourWayDirections : sixWayDirections;

  useEffect(() => () => releasePendingKey.current?.(), []);

  function pressDirection(key, keyCode) {
    if (layout !== "four-way") {
      dispatchSyntheticKeypress(frameRef.current, { key, keyCode }, { focus: false });
      return;
    }

    // AGOS reads its action after polling all queued events, so a keyup in the
    // same poll clears the action before it can move the player.
    releasePendingKey.current?.();
    const release = holdGameKey(frameRef.current, { key, keyCode }, { focus: false });
    if (!release) return;
    const timer = window.setTimeout(finish, 50);
    function finish() {
      window.clearTimeout(timer);
      releasePendingKey.current = null;
      release();
    }
    releasePendingKey.current = finish;
  }

  return (
    <div
      aria-label="Walk controls"
      className="game-route-stick-base game-route-dungeon-walk-pad"
      data-layout={layout}
      role="group"
    >
      {directions.map(({ label, Icon, key, keyCode, position }) => (
        <button
          aria-label={label}
          className="game-route-dungeon-walk-direction"
          data-position={position}
          key={key}
          onClick={() => pressDirection(key, keyCode)}
          title={label}
          type="button"
        >
          <Icon aria-hidden="true" size={15} />
        </button>
      ))}
    </div>
  );
}

export default function GameTouchCursorPad({
  frameRef,
  indicatorOffset,
  onPointerCancel,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onSelectMode,
  showTouchCursorPad,
  showTouchWalk,
  walkLayout,
}) {
  if (!showTouchCursorPad && !showTouchWalk) {
    return null;
  }

  return (
    <div className="game-route-touch-cursor-pad-shell">
      {onSelectMode && (
        <div aria-label="Touch control mode" className="game-route-touch-mode-switch" role="group">
          <button
            aria-label="Walk"
            aria-pressed={showTouchWalk}
            onClick={() => onSelectMode("walk")}
            title="Walk"
            type="button"
          >
            <Move aria-hidden="true" size={16} />
          </button>
          <button
            aria-label="Cursor"
            aria-pressed={showTouchCursorPad}
            onClick={() => onSelectMode("cursor")}
            title="Cursor"
            type="button"
          >
            <MousePointer2 aria-hidden="true" size={16} />
          </button>
        </div>
      )}
      {showTouchWalk ? <DungeonWalkPad frameRef={frameRef} layout={walkLayout} /> : <button
        aria-label="Adjust cursor"
        className="game-route-touch-cursor-pad"
        onPointerCancel={onPointerCancel}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        type="button"
      >
        <span aria-hidden="true" className="game-route-touch-cursor-pad-grid" />
        <span
          aria-hidden="true"
          className="game-route-touch-cursor-pad-indicator"
          style={{
            transform: `translate(${indicatorOffset.x}px, ${indicatorOffset.y}px)`,
          }}
        >
          <MousePointer2 aria-hidden="true" size={18} />
        </span>
      </button>}
    </div>
  );
}
