export default function GameTouchCursorPad({
  indicatorOffset,
  onPointerCancel,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  showTouchCursorPad,
}) {
  if (!showTouchCursorPad) {
    return null;
  }

  return (
    <div className="game-route-touch-cursor-pad-shell">
      <button
        aria-label="Adjust cursor"
        className="game-route-touch-cursor-pad"
        onPointerCancel={onPointerCancel}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        type="button"
      >
        <span aria-hidden="true" className="game-route-touch-cursor-pad-grid" />
        <span aria-hidden="true" className="game-route-touch-cursor-pad-crosshair" />
        <span
          aria-hidden="true"
          className="game-route-touch-cursor-pad-indicator"
          style={{
            transform: `translate(${indicatorOffset.x}px, ${indicatorOffset.y}px)`,
          }}
        />
        <span aria-hidden="true" className="game-route-touch-cursor-pad-label">
          Adjust
        </span>
      </button>
    </div>
  );
}
