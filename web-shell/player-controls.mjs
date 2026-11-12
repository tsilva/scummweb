export function installPlayerControls(scope, requestMenu) {
  const clamp = (value, min, max, fallback) =>
    Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback;
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

  scope.scummwebPlayerControls = Object.freeze({
    read: () => ({
      volume, speed, canSave, canLoad, dialogueActive, nextSlot: nextSlot(),
      saves: saves.filter(({ slot }) => slot <= maxSlot),
    }),
    setSettings(settings) {
      volume = clamp(settings.volume, 0, 100, volume);
      speed = clamp(settings.speed, 0.5, 1.5, speed);
      applyVolume();
    },
    setMenuOpen(open) {
      menuOpen = open;
      applyVolume();
    },
    run(operation, requestedSlot) {
      if (!menuOpen || pending) return { error: "Another save or load is still in progress." };
      const isNew = operation === "save" && requestedSlot === null;
      const slot = isNew ? nextSlot() : requestedSlot;
      const entry = saves.find((save) => save.slot === slot);
      if (operation === "save") {
        if (!canSave || !Number.isInteger(slot) || slot < 1 || slot > maxSlot || slot === reservedSlot ||
            (!isNew && !entry?.writable)) return { error: "This save slot is unavailable." };
      } else if (operation !== "load" || !canLoad || !entry || slot > maxSlot) {
        return { error: "This save is unavailable." };
      }
      return new Promise((resolve) => {
        const timer = scope.setTimeout(() => {
          resolve({ error: "The game did not respond. Resume playing and try again." });
          // A late acknowledgment belongs to this request, never to a retry.
          if (!pending.dispatched) pending = undefined;
        }, 5000);
        pending = { operation, slot, isNew, entry, timer, resolve, dispatched: false, written: new Set() };
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
    saves = entries.toSorted((a, b) => b.modifiedAt - a.modifiedAt || a.slot - b.slot);
    occupied = new Set(usedSlots);
  };
  scope.__scummwebPlayerIsNewSave = () => pending?.isNew;
  scope.__scummwebPlayerSaveCaption = (slot) =>
    pending?.entry?.description || `Save ${slot}`;
  scope.__scummwebPlayerSaveWritten = (name) => {
    if (pending?.dispatched && pending.operation === "save") pending.written.add(name);
  };

  function boundary(max, reserved, save, load) {
    maxSlot = max;
    reservedSlot = reserved;
    canSave = save;
    canLoad = load;
    if (pending && !pending.dispatched) {
      pending.dispatched = true;
      const { operation, slot } = pending;
      if (operation === "save") return slot;
      return slot === 0 ? 2 * max + 1 : max + slot;
    }
    return menuOpen ? -1 : 0;
  }

  scope.__scummwebAgentBoundary = (_tick, max, reserved = 0) => boundary(max, reserved, true, true);
  scope.__scummwebAgentFrameBoundary = (_frame, max, reserved, save, load) =>
    boundary(max, reserved, Boolean(save), Boolean(load));
  scope.__scummwebAgentSaveResult = (error) => {
    if (!pending?.dispatched) return;
    const { operation, slot, timer, resolve, written } = pending;
    pending = undefined;
    scope.clearTimeout(timer);
    if (!error && operation === "save" && !saves.some((save) => save.slot === slot && written.has(save.name))) {
      error = "ScummVM could not confirm that the save was stored.";
    }
    resolve(error ? { error } : { slot });
  };

  if (requestMenu) {
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
