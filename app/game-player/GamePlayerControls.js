import { LogOut, Maximize, Menu, Minimize } from "lucide-react";

export default function GamePlayerControls({
  handleControlMouseDown,
  isFullscreen,
  onExit,
  onOpenMenu,
  onSkipIntro,
  onTouchLeftClick,
  onTouchRightClick,
  onToggleFullscreen,
  showBottomActions,
  showExitControl,
  showFullscreenControl,
  showScummvmMenuButton,
  showSkipIntroAction,
  showTouchClickButtons,
}) {
  const FullscreenIcon = isFullscreen ? Minimize : Maximize;
  const fullscreenLabel = isFullscreen ? "Exit fullscreen" : "Enter fullscreen";
  const scummvmMenuLabel = "Open ScummVM menu";

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
          {showTouchClickButtons ? (
            <div
              aria-label="Touch mouse buttons"
              className="game-route-touch-click-buttons"
              role="group"
            >
              <button
                aria-label="Left click"
                className="game-route-control-button is-touch-click"
                data-button="left"
                onClick={onTouchLeftClick}
                onMouseDown={handleControlMouseDown}
                title="Left click"
                type="button"
              >
                <span aria-hidden="true" className="game-route-touch-click-label">
                  L
                </span>
              </button>
              <button
                aria-label="Right click"
                className="game-route-control-button is-touch-click"
                data-button="right"
                onClick={onTouchRightClick}
                onMouseDown={handleControlMouseDown}
                title="Right click"
                type="button"
              >
                <span aria-hidden="true" className="game-route-touch-click-label">
                  R
                </span>
              </button>
            </div>
          ) : null}
        </div>
      ) : null}
    </>
  );
}
