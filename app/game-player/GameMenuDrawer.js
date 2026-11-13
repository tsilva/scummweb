import { ArrowLeft, ChevronRight, FolderOpen, Plus, Save, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

const defaultSettings = { volume: 100, speed: 1, subtitles: true, canToggleSubtitles: false, saves: [] };
const formatDate = new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" });

function saveTitle(save) {
  return save.description?.trim() || `Save ${save.slot}`;
}

function isBackdropEvent(event) {
  const dialog = event.currentTarget;
  if (event.target !== dialog) return false;
  // The browser also targets the dialog when the pointer is over its backdrop.
  const { left, right, top, bottom } = dialog.getBoundingClientRect();
  return event.clientX < left || event.clientX >= right || event.clientY < top || event.clientY >= bottom;
}

function MenuSlider({ label, value, min, max, step, text, onChange, disabled }) {
  return (
    <label className="game-menu-slider">
      <span>{label}</span>
      <span aria-hidden="true" className="game-menu-slider-value">{text}</span>
      <input
        aria-valuetext={text}
        disabled={disabled}
        max={max}
        min={min}
        onChange={(event) => onChange(event.currentTarget.valueAsNumber)}
        step={step}
        style={{ "--slider-fill": `${100 * (value - min) / (max - min)}%` }}
        type="range"
        value={value}
      />
    </label>
  );
}

export default function GameMenuDrawer({ frameRef, initialPage = "menu", onClose, onExit, onNativeMenu, title }) {
  const dialogRef = useRef(null);
  const pressedBackdrop = useRef(false);
  const controller = useRef(null);
  const [page, setPage] = useState(initialPage === "load" ? "load" : "menu");
  const [settings, setSettings] = useState(defaultSettings);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [overwrite, setOverwrite] = useState(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    const player = frameRef.current?.contentWindow?.scummwebPlayerControls;
    controller.current = player;
    player?.setMenuOpen(true);
    setSettings(player?.read() ?? defaultSettings);
    if (!dialog.open) dialog.showModal();
    return () => {
      player?.setMenuOpen(false);
      controller.current = null;
    };
  }, [frameRef]);

  useEffect(() => {
    if (busy) return;
    const dialog = dialogRef.current;
    const focus = dialog.querySelector("[data-menu-focus]:not(:disabled)") ??
      dialog.querySelector(".game-menu-close");
    focus?.focus({ preventScroll: true });
  }, [page, overwrite, busy]);

  function go(next) {
    setSettings(controller.current?.read() ?? defaultSettings);
    setError(null);
    setOverwrite(null);
    setPage(next);
  }

  function update(name, value) {
    controller.current?.setSettings({ [name]: value });
    setSettings(controller.current?.read() ?? defaultSettings);
  }

  async function run(operation, slot) {
    const player = controller.current;
    if (!player || busy) return;
    setBusy(true);
    setError(null);
    try {
      const result = await player.run(operation, slot);
      if (player !== controller.current) return;
      setSettings(player.read());
      if (result.error) setError(result.error);
      else if (operation === "load") dialogRef.current?.close();
      else setOverwrite(null);
    } catch {
      if (player === controller.current) setError("The game could not complete the request.");
    } finally {
      if (player === controller.current) setBusy(false);
    }
  }

  const heading = { menu: "Game Menu", save: "Save Game", load: "Load Game" }[page];
  const supported = page === "save" ? settings.canSave : settings.canLoad;
  const slots = page === "save"
    ? settings.saves.filter((save) => save.writable && save.slot > 0)
    : settings.saves;

  return (
    <dialog
      aria-labelledby="game-menu-heading"
      className="game-menu-drawer"
      id="game-menu-drawer"
      onCancel={(event) => {
        event.preventDefault();
        if (busy) return;
        if (overwrite) setOverwrite(null);
        else if (page !== "menu") go("menu");
        else event.currentTarget.close();
      }}
      onClick={(event) => {
        const startedOutside = pressedBackdrop.current;
        pressedBackdrop.current = false;
        if (!busy && startedOutside && isBackdropEvent(event)) event.currentTarget.close();
      }}
      onClose={onClose}
      onPointerDown={(event) => { pressedBackdrop.current = isBackdropEvent(event); }}
      ref={dialogRef}
    >
      <header className="game-menu-header">
        <div>
          <div className="game-menu-heading-row">
            {page !== "menu" && (
              <button aria-label="Back to game menu" disabled={busy} onClick={() => go("menu")} type="button">
                <ArrowLeft aria-hidden="true" size={23} />
              </button>
            )}
            <h2 id="game-menu-heading">{heading}</h2>
          </div>
          <p>{title}</p>
        </div>
        <button
          aria-label="Close game menu"
          className="game-menu-close"
          disabled={busy}
          onClick={() => dialogRef.current.close()}
          type="button"
        >
          <X aria-hidden="true" size={22} />
        </button>
      </header>
      {page === "menu" ? (
        <>
          <div className="game-menu-actions">
            <button className="game-menu-outlined" data-menu-focus onClick={() => go("save")} type="button">
              <Save aria-hidden="true" size={22} /><span>Save Game</span><ChevronRight aria-hidden="true" size={19} />
            </button>
            <button className="game-menu-outlined" onClick={() => go("load")} type="button">
              <FolderOpen aria-hidden="true" size={22} /><span>Load Game</span><ChevronRight aria-hidden="true" size={19} />
            </button>
          </div>
          <div className="game-menu-sliders">
            <MenuSlider label="Sound Volume" value={settings.volume} min={0} max={100} step={1}
              text={`${settings.volume}%`} onChange={(value) => update("volume", value)} disabled={!controller.current} />
            <MenuSlider label="Game Speed" value={settings.speed} min={0.5} max={1.5} step={0.1}
              text={`${settings.speed}×`} onChange={(value) => update("speed", value)} disabled={!controller.current} />
            {settings.canToggleSubtitles && (
              <label className="game-menu-toggle">
                <span>Subtitles</span>
                <input type="checkbox" role="switch" checked={settings.subtitles}
                  onChange={(event) => update("subtitles", event.currentTarget.checked)} />
              </label>
            )}
          </div>
          <div className="game-menu-session-actions">
            <button className="game-menu-primary" onClick={() => dialogRef.current.close()} type="button">Resume Game</button>
            <button className="game-menu-outlined" onClick={onExit} type="button">Quit Game</button>
          </div>
        </>
      ) : (
        <div aria-busy={busy} className="game-menu-picker">
          {!supported ? (
            <>
              <p className="game-menu-note">This game does not offer {page === "save" ? "saving" : "loading"} through this menu.</p>
              <button className="game-menu-outlined" data-menu-focus onClick={onNativeMenu} type="button">
                Open native menu
              </button>
            </>
          ) : overwrite ? (
            <>
              <p className="game-menu-note">Overwrite “{saveTitle(overwrite)}” with your current progress?</p>
              <button className="game-menu-outlined" data-menu-focus disabled={busy} onClick={() => setOverwrite(null)} type="button">
                Cancel
              </button>
              <button className="game-menu-primary" disabled={busy} onClick={() => void run("save", overwrite.slot)} type="button">
                Overwrite Save
              </button>
            </>
          ) : (
            <>
              {page === "save" && (
                <button className="game-menu-primary game-menu-new" data-menu-focus disabled={busy || settings.nextSlot === null}
                  onClick={() => void run("save", null)} type="button">
                  <Plus aria-hidden="true" size={23} /> New Save
                </button>
              )}
              {slots.length ? (
                <ul className="game-menu-slots">
                  {slots.map((save, index) => (
                    <li key={save.slot}>
                      <button
                        data-menu-focus={page === "load" && index === 0 ? "" : undefined}
                        disabled={busy}
                        onClick={() => page === "save" ? setOverwrite(save) : void run("load", save.slot)}
                        type="button"
                      >
                        <span>
                          <strong>{saveTitle(save)}</strong>
                          {Number.isFinite(save.modifiedAt) && <small>{formatDate.format(save.modifiedAt)}</small>}
                        </span>
                        <ChevronRight aria-hidden="true" size={22} />
                      </button>
                    </li>
                  ))}
                </ul>
              ) : <p className="game-menu-note">No saved games yet.</p>}
            </>
          )}
          {busy && <p className="game-menu-note" role="status">{page === "save" ? "Saving…" : "Loading…"}</p>}
          {error && <p className="game-menu-note" role="alert">{error}</p>}
        </div>
      )}
    </dialog>
  );
}
