import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, CornerUpLeft, CornerUpRight, MousePointer2, Move } from "lucide-react";
import { dispatchSyntheticKeypress } from "./keyboard";

// ScummVM's Kyra dungeon controls use Home/Page Up to turn and arrows to move.
const walkDirections = [
  { label: "Turn left", Icon: CornerUpLeft, key: "Home", keyCode: 36, position: "upper-left" },
  { label: "Step forward", Icon: ArrowUp, key: "ArrowUp", keyCode: 38, position: "top" },
  { label: "Turn right", Icon: CornerUpRight, key: "PageUp", keyCode: 33, position: "upper-right" },
  { label: "Sidestep left", Icon: ArrowLeft, key: "ArrowLeft", keyCode: 37, position: "lower-left" },
  { label: "Step back", Icon: ArrowDown, key: "ArrowDown", keyCode: 40, position: "bottom" },
  { label: "Sidestep right", Icon: ArrowRight, key: "ArrowRight", keyCode: 39, position: "lower-right" },
];

function DungeonWalkPad({ frameRef }) {
  return (
    <div aria-label="Walk controls" className="game-route-stick-base game-route-dungeon-walk-pad" role="group">
      {walkDirections.map(({ label, Icon, key, keyCode, position }) => (
        <button
          aria-label={label}
          className="game-route-dungeon-walk-direction"
          data-position={position}
          key={key}
          onClick={() => dispatchSyntheticKeypress(frameRef.current, { key, keyCode }, { focus: false })}
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
      {showTouchWalk ? <DungeonWalkPad frameRef={frameRef} /> : <button
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
