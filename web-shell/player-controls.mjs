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
  let saves = [];
  let occupied = new Set();
  let pending;

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
        volume, speed, canSave, canLoad, dialogueActive, nextSlot: nextSlot(),
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
    setMenuOpen(open) {
      menuOpen = open;
      applyVolume();
    },
    listBackup(files) {
      if (!menuOpen || pending || !canLoad || scope.__scummwebSaveWriteInProgress?.()) return null;
      return scope.__scummwebDiagnosticSaves?.listBackup(files) ?? null;
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
        }, 5000);
        pending = { operation, slot, isNew, entry, isolated, timer, resolve, dispatched: false, written: new Set() };
      });
    },
  });

  scope.__scummwebSetDialogueActive = (active) => { dialogueActive = Boolean(active); };

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

  function boundary(max, reserved, save, load) {
    maxSlot = max;
    reservedSlot = reserved;
    canSave = save;
    canLoad = load;
    const autosaveDue = scope.__scummwebAutosaves?.due();
    if (!pending && !menuOpen && canSave && canLoad && autosaveDue) {
      const slot = reserved === 1 ? 2 : 1;
      scope.__scummwebAutosaves.retry();
      if (slot <= maxSlot && scope.__scummwebDiagnosticSaves?.begin()) {
        pending = { operation: "autosave", slot, dispatched: true };
        return slot;
      }
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

  scope.__scummwebAgentBoundary = (_tick, max, reserved = 0) => boundary(max, reserved, true, true);
  scope.__scummwebAgentFrameBoundary = (_frame, max, reserved, save, load) =>
    boundary(max, reserved, Boolean(save), Boolean(load));
  scope.__scummwebAgentSaveResult = (error) => {
    if (!pending?.dispatched) return;
    const { operation, slot, timer, resolve, written, isolated } = pending;
    pending = undefined;
    scope.clearTimeout(timer);
    if (operation === "autosave") {
      const result = scope.__scummwebDiagnosticSaves.finish(error);
      if (scope.__scummwebAutosaves.save(result, slot)) scope.Module?._scummweb_refresh_saves?.();
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
