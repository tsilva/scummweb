import { LogOut, Maximize, Menu, Minimize } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { observeControlVisibility } from "./control-visibility.mjs";

export default function GamePlayerControls({
  autoHide = false,
  frameRef,
  menuShortcut,
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
  showGameMenuButton,
  showSkipIntroAction,
  showTouchClickButtons,
}) {
  const controlsRef = useRef(null);
  const visibilityRef = useRef(null);
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    if (!autoHide) return;
    const visibility = observeControlVisibility({
      controls: controlsRef.current,
      frame: frameRef.current,
      hostWindow: window,
      menuShortcut,
      onVisible: setVisible,
    });
    visibilityRef.current = visibility;
    return () => {
      visibility.dispose();
      visibilityRef.current = null;
    };
  }, [autoHide, frameRef, menuShortcut]);

  const FullscreenIcon = isFullscreen ? Minimize : Maximize;
  const fullscreenLabel = isFullscreen ? "Exit fullscreen" : "Enter fullscreen";
  const gameMenuLabel = "Open game menu";

  return (
    <>
      <div className={`game-route-controls${autoHide && !visible ? " is-idle" : ""}`} ref={controlsRef}>
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
          {showGameMenuButton ? (
            <button
              aria-label={gameMenuLabel}
              className="game-route-control-button is-menu"
              onClick={() => {
                visibilityRef.current?.holdForMenu();
                onOpenMenu();
              }}
              onMouseDown={handleControlMouseDown}
              title={gameMenuLabel}
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
