import { LogOut, Maximize, Menu, Minimize } from "lucide-react";

function TouchClickModeIcon({ mode }) {
  const isRightMode = mode === "right";

  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <path
        d="M12 3.5c3.59 0 6.5 2.91 6.5 6.5v4.2c0 3.76-2.91 6.8-6.5 6.8s-6.5-3.04-6.5-6.8V10c0-3.59 2.91-6.5 6.5-6.5Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
      />
      <path
        d="M12 4.2v6.15"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="1.4"
      />
      <path
        d="M7.2 9.55c.22-2.27 2.14-4.05 4.48-4.05h.32v5.2H7.2v-1.15Z"
        fill={isRightMode ? "none" : "currentColor"}
        fillOpacity={isRightMode ? undefined : "0.92"}
      />
      <path
        d="M12 5.5h.32c2.34 0 4.26 1.78 4.48 4.05v1.15H12V5.5Z"
        fill={isRightMode ? "currentColor" : "none"}
        fillOpacity={isRightMode ? "0.92" : undefined}
      />
    </svg>
  );
}

export default function GamePlayerControls({
  handleControlMouseDown,
  isFullscreen,
  onExit,
  onOpenMenu,
  onSkipIntro,
  onToggleFullscreen,
  onToggleTouchClickMode,
  showBottomActions,
  showExitControl,
  showFullscreenControl,
  showScummvmMenuButton,
  showSkipIntroAction,
  showTouchClickToggle,
  touchClickMode,
}) {
  const FullscreenIcon = isFullscreen ? Minimize : Maximize;
  const fullscreenLabel = isFullscreen ? "Exit fullscreen" : "Enter fullscreen";
  const scummvmMenuLabel = "Open ScummVM menu";
  const touchClickToggleLabel =
    touchClickMode === "right"
      ? "Touch click mode: right click. Tap to switch to left click."
      : "Touch click mode: left click. Tap to switch to right click.";

  return (
    <>
      <div className="game-route-controls">
        {showExitControl ? (
          <div className="game-route-control-group is-left">
            <button
              aria-label="Exit game"
              className="game-route-control-button is-exit"
              onClick={onExit}
              onMouseDown={handleControlMouseDown}
              title="Exit game"
              type="button"
            >
              <LogOut aria-hidden="true" size={17} strokeWidth={2} />
            </button>
          </div>
        ) : null}
        <div className="game-route-control-group is-right">
          {showTouchClickToggle ? (
            <>
              <button
                aria-label={touchClickToggleLabel}
                aria-pressed={touchClickMode === "right"}
                className="game-route-control-button is-touch-toggle"
                data-mode={touchClickMode}
                onClick={onToggleTouchClickMode}
                onMouseDown={handleControlMouseDown}
                title={touchClickToggleLabel}
                type="button"
              >
                <TouchClickModeIcon mode={touchClickMode} />
              </button>
              {showFullscreenControl ? (
                <button
                  aria-label={fullscreenLabel}
                  className="game-route-control-button is-fullscreen"
                  onClick={onToggleFullscreen}
                  onMouseDown={handleControlMouseDown}
                  title={fullscreenLabel}
                  type="button"
                >
                  <FullscreenIcon aria-hidden="true" size={18} strokeWidth={2} />
                </button>
              ) : null}
              {showScummvmMenuButton ? (
                <button
                  aria-label={scummvmMenuLabel}
                  className="game-route-control-button is-menu"
                  onClick={onOpenMenu}
                  onMouseDown={handleControlMouseDown}
                  title={scummvmMenuLabel}
                  type="button"
                >
                  <Menu aria-hidden="true" size={18} strokeWidth={2} />
                </button>
              ) : null}
            </>
          ) : (
            <>
              {showFullscreenControl ? (
                <button
                  aria-label={fullscreenLabel}
                  className="game-route-control-button is-fullscreen"
                  onClick={onToggleFullscreen}
                  onMouseDown={handleControlMouseDown}
                  title={fullscreenLabel}
                  type="button"
                >
                  <FullscreenIcon aria-hidden="true" size={18} strokeWidth={2} />
                </button>
              ) : null}
              {showScummvmMenuButton ? (
                <button
                  aria-label={scummvmMenuLabel}
                  className="game-route-control-button is-menu"
                  onClick={onOpenMenu}
                  onMouseDown={handleControlMouseDown}
                  title={scummvmMenuLabel}
                  type="button"
                >
                  <Menu aria-hidden="true" size={18} strokeWidth={2} />
                </button>
              ) : null}
            </>
          )}
        </div>
      </div>
      {showBottomActions ? (
        <div className="game-route-bottom-actions">
          {showSkipIntroAction ? (
            <button
              className="game-route-skip-intro-button"
              onClick={onSkipIntro}
              type="button"
            >
              Skip intro
            </button>
          ) : null}
        </div>
      ) : null}
    </>
  );
}
