import { ArrowLeft, Bug, Check, ChevronRight, FolderOpen, LoaderCircle, Save, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import GameBackupSaves from "./GameBackupSaves";
import GameBugReport from "./GameBugReport";

const defaultSettings = { volume: 100, speed: 1, subtitles: true, canToggleSubtitles: false, saves: [] };
const formatDate = new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" });
const formatAutosaveDate = new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "medium" });

function saveTitle(save) {
  if (save.checkpoint) return "Autosave";
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

export default function GameMenuDrawer({ backupDestinationKey, frameRef, initialPage = "menu", onClose, onExit, onNativeMenu, reportGame, title }) {
  const dialogRef = useRef(null);
  const pressedBackdrop = useRef(false);
  const controller = useRef(null);
  const [page, setPage] = useState(initialPage === "load" ? "load" : "menu");
  const [settings, setSettings] = useState(defaultSettings);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState(null);
  const [overwrite, setOverwrite] = useState(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    const player = frameRef.current?.contentWindow?.scummwebPlayerControls;
    controller.current = player;
    player?.setMenuOpen(true, () => {
      const { canSave, canSaveHere, nextSlot } = player.read();
      setSettings((current) => ({ ...current, canSave, canSaveHere, nextSlot }));
    });
    setSettings(player?.read({ includeAutosaves: initialPage === "load" }) ?? defaultSettings);
    if (!dialog.open) dialog.showModal();
    return () => {
      player?.setMenuOpen(false);
      controller.current = null;
    };
  }, [frameRef, initialPage]);

  useEffect(() => {
    if (busy) return;
    const dialog = dialogRef.current;
    const focus = dialog.querySelector("[data-menu-focus]:not(:disabled)") ??
      dialog.querySelector(".game-menu-close");
    focus?.focus({ preventScroll: true });
  }, [page, overwrite, busy]);

  function go(next) {
    setSettings(controller.current?.read({ includeAutosaves: next === "load" }) ?? defaultSettings);
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
    if (!player || busy || (operation === "save" && saved)) return;
    setBusy(true);
    setError(null);
    try {
      const result = await player.run(operation, slot);
      if (player !== controller.current) return;
      setSettings(player.read({ includeAutosaves: operation === "load" }));
      if (result.error) setError(result.error);
      else if (operation === "load") dialogRef.current?.close();
      else {
        setOverwrite(null);
        setPage("menu");
        setSaved(true);
      }
    } catch {
      if (player === controller.current) setError("The game could not complete the request.");
    } finally {
      if (player === controller.current) setBusy(false);
    }
  }

  function saveGame() {
    if (settings.canSave && Number.isInteger(settings.nextSlot)) void run("save", null);
    else go("save");
  }

  const heading = { menu: "Game Menu", save: "Save Game", load: "Load Game", report: "Report a bug" }[page];
  const supported = page === "save" ? settings.canSave : settings.canLoad;
  const slots = page === "save"
    ? settings.saves.filter((save) => save.writable && save.slot > 0)
    : settings.saves;
  const SaveIcon = busy ? LoaderCircle : saved ? Check : Save;
  const saveBlockedHere = settings.canSave && settings.canSaveHere === false;
  const saveAvailabilityPending = settings.canSave === undefined || (settings.canSave && settings.canSaveHere === undefined);

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
            <button
              aria-busy={busy}
              aria-describedby={saveBlockedHere ? "game-menu-save-unavailable" : undefined}
              className="game-menu-outlined"
              data-menu-focus
              disabled={busy || saved || saveBlockedHere || saveAvailabilityPending}
              onClick={saveGame}
              type="button"
            >
              <SaveIcon aria-hidden="true" className={busy ? "game-menu-saving-spinner" : undefined} size={22} />
              <span>{busy ? "Saving…" : saved ? "Saved" : "Save Game"}</span>
            </button>
            <span className="game-menu-save-status" role="status">{busy ? "Saving game" : saved ? "Game saved" : ""}</span>
            {saveBlockedHere && (
              <p className="game-menu-save-unavailable" id="game-menu-save-unavailable">You can’t save in this location.</p>
            )}
            {error && <p className="game-menu-note" role="alert">{error}</p>}
            <button className="game-menu-outlined" disabled={busy} onClick={() => go("load")} type="button">
              <FolderOpen aria-hidden="true" size={22} /><span>Load Game</span><ChevronRight aria-hidden="true" size={19} />
            </button>
          </div>
          <div className="game-menu-sliders">
            <MenuSlider label="Sound Volume" value={settings.volume} min={0} max={100} step={1}
              text={`${settings.volume}%`} onChange={(value) => update("volume", value)} disabled={busy || !controller.current} />
            <MenuSlider label="Game Speed" value={settings.speed} min={0.5} max={2} step={0.1}
              text={`${settings.speed}×`} onChange={(value) => update("speed", value)} disabled={busy || !controller.current} />
            {settings.canToggleSubtitles && (
              <label className="game-menu-toggle">
                <span>Subtitles</span>
                <input type="checkbox" role="switch" checked={settings.subtitles} disabled={busy}
                  onChange={(event) => update("subtitles", event.currentTarget.checked)} />
              </label>
            )}
          </div>
          <div className="game-menu-session-actions">
            <button className="game-menu-primary" disabled={busy} onClick={() => dialogRef.current.close()} type="button">Resume Game</button>
            <button className="game-menu-outlined" disabled={busy} onClick={onExit} type="button">Quit Game</button>
            <button className="game-menu-outlined game-menu-report" disabled={busy} onClick={() => go("report")} type="button">
              <Bug aria-hidden="true" size={22} /><span>Report a bug</span><ChevronRight aria-hidden="true" size={19} />
            </button>
          </div>
        </>
      ) : page === "report" ? (
        <GameBugReport frameRef={frameRef} game={reportGame} onBusyChange={setBusy}
          onCancel={() => go("menu")} onResume={() => dialogRef.current.close()} />
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
              {page === "save" && <p className="game-menu-note">All manual save slots are in use.</p>}
              {slots.length ? (
                <ul className="game-menu-slots">
                  {slots.map((save, index) => (
                    <li key={save.checkpoint ?? save.slot}>
                      <button
                        data-menu-focus={index === 0 ? "" : undefined}
                        disabled={busy}
                        onClick={() => page === "save" ? setOverwrite(save) : void run("load", save.checkpoint ?? save.slot)}
                        type="button"
                      >
                        <span>
                          <strong>{saveTitle(save)}</strong>
                          {Number.isFinite(save.modifiedAt) && (
                            <small>{(save.checkpoint ? formatAutosaveDate : formatDate).format(save.modifiedAt)}</small>
                          )}
                        </span>
                        <ChevronRight aria-hidden="true" size={22} />
                      </button>
                    </li>
                  ))}
                </ul>
              ) : <p className="game-menu-note">{page === "save" ? "No saves can be overwritten here." : "No current saves yet."}</p>}
            </>
          )}
          {busy && page === "save" && <p className="game-menu-note" role="status">Saving…</p>}
          {error && <p className="game-menu-note" role="alert">{error}</p>}
          {page === "load" && settings.canLoadBackups && backupDestinationKey && (
            <GameBackupSaves
              destinationKey={backupDestinationKey}
              disabled={busy}
              fingerprint={reportGame?.saveFingerprint}
              frameRef={frameRef}
              onLoad={save => void run("load", save)}
            />
          )}
        </div>
      )}
      {page === "load" && (
        <div className="game-menu-load-status" role="status">
          {busy && (
            <>
              <span>Loading saved game</span>
              <LoaderCircle aria-hidden="true" size={28} />
            </>
          )}
        </div>
      )}
    </dialog>
  );
}
