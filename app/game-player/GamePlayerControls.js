import { LogOut, Maximize, Menu, Minimize, TriangleAlert } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import DirectionalNavigation from "../home-shell/directional-navigation";
import { observeControlVisibility } from "./control-visibility.mjs";
import { clickGameMouse, setGameMouseButton } from "./game-mouse.mjs";
import GameMenuDrawer from "./GameMenuDrawer";

function TouchMouseButton({ button, frameRef }) {
  const pressRef = useRef(null);
  const label = button === "left" ? "Left click" : "Right click";

  function release(cancelled) {
    const press = pressRef.current;
    if (!press) return;
    pressRef.current = null;
    setGameMouseButton(press.frame, window.location.origin, button, false, cancelled);
  }

  useEffect(() => () => release(true), [button]);

  return (
    <button
      aria-label={label}
      className="game-route-control-button is-touch-click"
      data-button={button}
      onClick={(event) => {
        // Keyboard and assistive activations have no matching pointer press.
        if (event.detail === 0) clickGameMouse(frameRef.current, window.location.origin, button);
      }}
      onContextMenu={(event) => event.preventDefault()}
      onPointerDown={(event) => {
        if (event.button !== 0 || pressRef.current) return;
        event.preventDefault();
        event.currentTarget.setPointerCapture(event.pointerId);
        pressRef.current = { pointerId: event.pointerId, frame: frameRef.current };
        setGameMouseButton(frameRef.current, window.location.origin, button, true);
      }}
      onPointerUp={(event) => {
        if (pressRef.current?.pointerId === event.pointerId) release(false);
      }}
      onPointerCancel={(event) => {
        if (pressRef.current?.pointerId === event.pointerId) release(true);
      }}
      onLostPointerCapture={(event) => {
        if (pressRef.current?.pointerId === event.pointerId) release(true);
      }}
      title={label}
      type="button"
    >
      <span aria-hidden="true" className="game-route-touch-click-label">
        {button === "left" ? "L" : "R"}
      </span>
    </button>
  );
}

export default function GamePlayerControls({
  autoHide = false,
  compatibilityWarnings,
  frameRef,
  gameMenuOpen,
  menuShortcut,
  handleControlMouseDown,
  isFullscreen,
  onExit,
  onCloseMenu,
  onNativeMenu,
  onOpenMenu,
  onResumeGame,
  onSkipIntro,
  onToggleFullscreen,
  showBottomActions,
  showExitControl,
  showFullscreenControl,
  showGameMenuButton,
  showSkipIntroAction,
  showTouchClickButtons,
  toolbarFocused,
  title,
  touchActions,
}) {
  const controlsRef = useRef(null);
  const warningButtonRef = useRef(null);
  const warningDialogRef = useRef(null);
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
    return () => visibility.dispose();
  }, [autoHide, frameRef, menuShortcut]);

  const FullscreenIcon = isFullscreen ? Minimize : Maximize;
  const fullscreenLabel = isFullscreen ? "Exit fullscreen" : "Enter fullscreen";
  const gameMenuLabel = "Open game menu";

  function keepToolbarFocus({ target }) {
    if (!toolbarFocused) return;
    // A cursor move already queued in the iframe can still focus its canvas.
    requestAnimationFrame(() => {
      const frame = frameRef.current;
      if (frame?.inert && document.activeElement === frame) {
        target.focus({ preventScroll: true });
      }
    });
  }

  return (
    <>
      {toolbarFocused || gameMenuOpen ? <DirectionalNavigation initialFocus="toolbar" onResumeGame={onResumeGame} />
        : showSkipIntroAction && <DirectionalNavigation initialFocus="skip-intro" />}
      <div
        className={`game-route-controls${autoHide && !visible ? " is-idle" : ""}`}
        onBlur={keepToolbarFocus}
        ref={controlsRef}
      >
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
          {compatibilityWarnings.length > 0 ? (
            <button
              aria-controls="game-compatibility-warning"
              aria-haspopup="dialog"
              aria-label="Compatibility warning"
              className="game-route-control-button"
              onClick={() => warningDialogRef.current.showModal()}
              ref={warningButtonRef}
              title="Compatibility warning"
              type="button"
            >
              <TriangleAlert aria-hidden="true" size={18} strokeWidth={2} />
            </button>
          ) : null}
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
              aria-controls={gameMenuOpen ? "game-menu-drawer" : undefined}
              aria-expanded={gameMenuOpen}
              aria-haspopup="dialog"
              aria-label={gameMenuLabel}
              className="game-route-control-button is-menu"
              onClick={onOpenMenu}
              onMouseDown={handleControlMouseDown}
              title={gameMenuLabel}
              type="button"
            >
              <Menu aria-hidden="true" size={18} strokeWidth={2} />
            </button>
          ) : null}
        </div>
      </div>
      {gameMenuOpen && (
        <GameMenuDrawer
          frameRef={frameRef}
          onClose={onCloseMenu}
          onExit={onExit}
          onNativeMenu={onNativeMenu}
          title={title}
        />
      )}
      {compatibilityWarnings.length > 0 ? (
        <dialog
          aria-describedby="game-compatibility-warning-text"
          aria-labelledby="game-compatibility-warning-title"
          className="game-route-warning"
          id="game-compatibility-warning"
          onClose={() => warningButtonRef.current?.focus({ preventScroll: true })}
          ref={warningDialogRef}
        >
          <h2 id="game-compatibility-warning-title">Compatibility warning</h2>
          <div id="game-compatibility-warning-text">
            {compatibilityWarnings.map((message) => <p key={message}>{message}</p>)}
          </div>
          <form method="dialog">
            <button type="submit">Close</button>
          </form>
        </dialog>
      ) : null}
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
              <TouchMouseButton button="left" frameRef={frameRef} />
              <TouchMouseButton button="right" frameRef={frameRef} />
            </div>
          ) : null}
          {touchActions}
        </div>
      ) : null}
    </>
  );
}
