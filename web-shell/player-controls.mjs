export function installPlayerControls(scope, requestMenu) {
  const clamp = (value, min, max, fallback) =>
    Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback;
  const byRecency = (a, b) => b.modifiedAt - a.modifiedAt || a.slot - b.slot;
  let volume = 100;
  let speed = 1;
  let menuOpen = false;
  let dialogueActive = false;
  let rawClock;
  let gameClock = 0;
  let maxSlot = 0;
  let reservedSlot = 0;
  let canSave = false;
  let canLoad = false;
  let canSaveHere;
  let onSaveAvailabilityChange;
  let saves = [];
  let occupied = new Set();
  let pending;
  let startupLoad;
  let exitSave;

  function finishExitSave() {
    if (!exitSave) return;
    scope.clearTimeout(exitSave.timer);
    exitSave.resolve();
    exitSave = undefined;
  }

  function applyVolume() {
    scope.__scummwebPlayerVolume = menuOpen ? 0 : volume / 100;
  }
  applyVolume();

  function nextSlot() {
    for (let slot = 1; slot <= maxSlot; slot++) {
      if (slot !== reservedSlot && !occupied.has(slot)) return slot;
    }
    return null;
  }

  function subtitleState() {
    const value = scope.Module?._scummweb_player_subtitles?.(-1) ?? -1;
    return { subtitles: value === 1, canToggleSubtitles: value >= 0 };
  }

  scope.scummwebPlayerControls = Object.freeze({
    read({ includeAutosaves = false } = {}) {
      const entries = includeAutosaves
        ? saves.concat(scope.__scummwebAutosaves?.list() ?? []).sort(byRecency)
        : saves;
      return {
        volume, speed, canSave, canLoad, canSaveHere, dialogueActive, nextSlot: nextSlot(),
        canLoadBackups: canLoad && scope.__scummwebDiagnosticSaves?.backupSupported() === true,
        ...subtitleState(),
        saves: entries.filter(({ slot }) => slot <= maxSlot),
      };
    },
    setSettings(settings) {
      volume = clamp(settings.volume, 0, 100, volume);
      speed = clamp(settings.speed, 0.5, 2, speed);
      if (typeof settings.subtitles === "boolean") {
        scope.Module?._scummweb_player_subtitles?.(Number(settings.subtitles));
      }
      applyVolume();
    },
    setMenuOpen(open, onSaveAvailability) {
      menuOpen = open;
      onSaveAvailabilityChange = onSaveAvailability;
      if (!open) canSaveHere = undefined;
      applyVolume();
    },
    listBackup(files) {
      if (!menuOpen || pending || !canLoad || scope.__scummwebSaveWriteInProgress?.()) return null;
      return scope.__scummwebDiagnosticSaves?.listBackup(files) ?? null;
    },
    saveOnExit() {
      if (exitSave) return exitSave.promise;
      if (canSaveHere === false || !scope.__scummwebAutosaves?.canCapture() ||
          !scope.__scummwebDiagnosticSaves?.supported()) return;
      const promise = new Promise((resolve) => {
        exitSave = { resolve, timer: scope.setTimeout(finishExitSave, 5000) };
      });
      exitSave.promise = promise;
      return promise;
    },
    run(operation, requestedSlot) {
      if (!menuOpen || pending) return { error: "Another save or load is still in progress." };
      const diagnostic = operation === "report";
      if (diagnostic && (!canSave || !scope.__scummwebDiagnosticSaves?.supported())) {
        return { status: "unavailable", files: [],
          reason: !canSave ? "saving-unsupported" : "runtime-unavailable" };
      }
      const isNew = diagnostic || operation === "save" && requestedSlot === null;
      const autosave = operation === "load" && typeof requestedSlot === "string"
        ? scope.__scummwebAutosaves?.find(requestedSlot) : undefined;
      const backup = operation === "load" && Array.isArray(requestedSlot?.files)
        && scope.__scummwebDiagnosticSaves?.backupSupported() ? requestedSlot : undefined;
      const isolated = autosave || backup;
      const slot = isolated?.slot ?? (diagnostic ? (reservedSlot === 1 ? 2 : 1) : isNew ? nextSlot() : requestedSlot);
      const entry = saves.find((save) => save.slot === slot);
      if (diagnostic) {
        if (slot > maxSlot) return { status: "unavailable", files: [], reason: "no-manual-slot" };
      } else if (operation === "save") {
        if (canSaveHere === false) return { error: "You can’t save right now." };
        if (!canSave || !Number.isInteger(slot) || slot < 1 || slot > maxSlot || slot === reservedSlot ||
            (!isNew && !entry?.writable)) return { error: "This save slot is unavailable." };
      } else if (operation !== "load" || !canLoad || (!entry && !isolated)
          || !Number.isInteger(slot) || slot < 0 || slot > maxSlot) {
        return { error: "This save is unavailable." };
      }
      return new Promise((resolve) => {
        const timer = scope.setTimeout(() => {
          resolve(diagnostic ? { status: "timeout", files: [], reason: "capture-timeout" }
            : { error: "The game did not respond. Resume playing and try again." });
          // A late acknowledgment belongs to this request, never to a retry.
          if (!pending.dispatched) pending = undefined;
          else pending.timedOut = true;
        }, 5000);
        pending = { operation, slot, isNew, entry, isolated, timer, resolve, dispatched: false, written: new Set() };
      });
    },
  });

  scope.__scummwebSetDialogueActive = (active) => { dialogueActive = Boolean(active); };
  scope.__scummwebPublishSaveAvailability = (available) => {
    available = Boolean(available);
    if (!menuOpen || canSaveHere === available) return;
    canSaveHere = available;
    onSaveAvailabilityChange?.();
  };

  scope.__scummwebPlayerMillis = (millis) => {
    if (rawClock === undefined) gameClock = millis;
    else gameClock += ((millis - rawClock) >>> 0) * speed;
    rawClock = millis;
    return gameClock >>> 0;
  };
  scope.__scummwebPlayerDelay = (millis) => Math.ceil(millis / speed);

  scope.__scummwebPublishPlayerSaves = (entries, usedSlots) => {
    saves = entries.toSorted(byRecency);
    occupied = new Set(usedSlots);
  };
  scope.__scummwebPlayerIsNewSave = () => pending?.isNew;
  scope.__scummwebPlayerSaveCaption = (slot) =>
    pending?.operation === "report" ? "Bug report" : pending?.entry?.description || `Save ${slot}`;
  scope.__scummwebPlayerSaveWritten = (name) => {
    if (pending?.dispatched && pending.operation === "save") pending.written.add(name);
  };

  scope.__scummwebPlayerAutosaveDue = () => {
    const due = scope.__scummwebAutosaves?.due();
    return !pending && !startupLoad && !scope.__scummwebSaveWriteInProgress?.() &&
      Boolean(exitSave || (!menuOpen && due));
  };

  scope.__scummwebQueueStartupLoad = (slot, files) => {
    if (startupLoad || !Number.isInteger(slot) || slot < 0) return false;
    startupLoad = { slot, files };
    return true;
  };
  scope.__scummwebIsStartupLoad = () => Boolean(startupLoad || pending?.startup);
  scope.__scummwebPeekStartupLoad = () => !menuOpen && !exitSave && !pending ? startupLoad?.slot ?? -1 : -1;
  scope.__scummwebTakeStartupLoad = () => {
    if (!startupLoad || menuOpen || exitSave || pending || scope.__scummwebSaveWriteInProgress?.()) return false;
    const { slot, files } = startupLoad;
    startupLoad = undefined;
    const resolve = ({ error }) => {
      if (error) scope.__scummwebPostCompatibilityWarning?.("The saved game could not be resumed. Use Load Game to select a save.");
    };
    if (files && !scope.__scummwebDiagnosticSaves?.beginRestore(files)) {
      resolve({ error: true });
      return false;
    }
    pending = { operation: "load", slot, resolve, isolated: Boolean(files), dispatched: true, startup: true };
    return true;
  };

  function boundary(completedFrame, max, reserved, save, load, canAutosaveNow) {
    // The native adapters report deferred results before their next completed
    // frame. While held or still loading, keep the original request in place.
    if (completedFrame && pending?.timedOut) {
      const expired = pending;
      pending = undefined;
      scope.clearTimeout(expired.timer);
      if (expired.isolated) scope.__scummwebDiagnosticSaves.finishRestore();
      if (expired.operation === "report") scope.__scummwebDiagnosticSaves.finish("Save timed out.");
    }
    maxSlot = max;
    reservedSlot = reserved;
    canSave = save;
    canLoad = load;
    if (!pending && !startupLoad && canAutosaveNow) {
      const slot = reserved === 1 ? 2 : 1;
      if (slot <= maxSlot && scope.__scummwebDiagnosticSaves?.begin()) {
        pending = { operation: "autosave", slot, dispatched: true, exitSave };
        return slot;
      }
      if (!exitSave) scope.__scummwebAutosaves.retry();
    }
    if (!pending && !startupLoad) {
      finishExitSave();
    }
    if (pending && !pending.dispatched) {
      if (pending.operation === "report" && !scope.__scummwebDiagnosticSaves.begin()) {
        scope.clearTimeout(pending.timer);
        pending.resolve({ status: "unavailable", files: [], reason: "temporary-storage-unavailable" });
        pending = undefined;
        return menuOpen ? -1 : 0;
      }
      if (pending.isolated && (!canLoad || pending.slot > max || scope.__scummwebSaveWriteInProgress?.() ||
          !scope.__scummwebDiagnosticSaves?.beginRestore(pending.isolated.files))) {
        scope.clearTimeout(pending.timer);
        pending.resolve({ error: "This saved game could not be opened." });
        pending = undefined;
        return menuOpen ? -1 : 0;
      }
      pending.dispatched = true;
      const { operation, slot } = pending;
      if (operation === "save" || operation === "report") return slot;
      return slot === 0 ? 2 * max + 1 : max + slot;
    }
    return menuOpen ? -1 : 0;
  }

  scope.__scummwebAgentBoundary = (tick, max, reserved = 0, canAutosaveNow) =>
    boundary(tick, max, reserved, true, true, Boolean(canAutosaveNow));
  scope.__scummwebAgentFrameBoundary = (frame, max, reserved, save, load, _gameLoop, canAutosaveNow) =>
    boundary(frame, max, reserved, Boolean(save), Boolean(load), Boolean(canAutosaveNow));
  scope.__scummwebAgentSaveResult = (error) => {
    if (!pending?.dispatched) return;
    const { operation, slot, timer, resolve, written, isolated, exitSave: exitRequest } = pending;
    pending = undefined;
    scope.clearTimeout(timer);
    if (operation === "autosave") {
      try {
        const result = scope.__scummwebDiagnosticSaves.finish(error);
        if ((!exitRequest || exitRequest === exitSave) && scope.__scummwebAutosaves.save(result, slot)) {
          scope.Module?._scummweb_refresh_saves?.();
        } else if (!exitRequest) {
          scope.__scummwebAutosaves.retry();
        }
      } finally {
        if (!exitRequest || exitRequest === exitSave) finishExitSave();
      }
      return;
    }
    if (operation === "report") {
      resolve({ ...scope.__scummwebDiagnosticSaves.finish(error), slot });
      return;
    }
    if (isolated) scope.__scummwebDiagnosticSaves.finishRestore();
    if (!error && operation === "save" && !saves.some((save) => save.slot === slot && written.has(save.name))) {
      error = "ScummVM could not confirm that the save was stored.";
    }
    if (!error && operation === "load") {
      scope.__scummwebAutosaves?.afterLoad();
      scope.__scummwebAutosaveAfterLoad?.();
    }
    if (!error && operation === "save" && scope.__scummwebFlushSaveStorage) {
      void scope.__scummwebFlushSaveStorage().then(() => resolve({ slot }),
        () => resolve({ error: "Could not store this save on this device. Your previous save is retained." }));
    } else resolve(error ? { error } : { slot });
  };

  if (requestMenu) {
    scope.__scummwebPlayerMenuOpen = () => menuOpen;
    scope.__scummwebRequestPlayerMenu = (page) => {
      // Hold the engine before the asynchronous parent message opens its drawer.
      menuOpen = true;
      applyVolume();
      requestMenu(page === "load" ? "load" : "menu");
      return true;
    };
    const handleEscape = (event) => {
      if (!event.isTrusted || event.key !== "Escape" || event.isComposing ||
          event.altKey || event.ctrlKey || event.metaKey || event.shiftKey ||
          scope.__scummwebReadyState?.state !== "ready") return;
      // Catch the real key before SDL can open its own menu.
      event.preventDefault();
      event.stopImmediatePropagation();
      if (event.type === "keydown" && !event.repeat) requestMenu();
    };
    scope.addEventListener("keydown", handleEscape, true);
    scope.addEventListener("keyup", handleEscape, true);
  }
}
