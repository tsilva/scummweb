export default function GameTouchJoystick({
  knobOffset,
  onPointerCancel,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  showTouchJoystick,
}) {
  if (!showTouchJoystick) {
    return null;
  }

  return (
    <div className="game-route-touch-joystick-shell">
      <button
        aria-label="Move cursor"
        className="game-route-touch-joystick"
        onPointerCancel={onPointerCancel}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        type="button"
      >
        <span
          aria-hidden="true"
          className="game-route-touch-joystick-knob"
          style={{
            transform: `translate(${knobOffset.x}px, ${knobOffset.y}px)`,
          }}
        />
      </button>
    </div>
  );
}
