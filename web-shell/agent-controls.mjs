export function importLegacySkySave(FS, params, source, destination) {
  const slot = params.get("agentLegacySkySlot");
  if (slot === null) return;
  if (params.get("catalogGame") !== "sky" || params.get("continue") !== "1" || !/^[1-9][0-9]{0,2}$/.test(slot)) {
    throw new Error("Legacy Sky save import requires a scoped Sky Continue launch and a manual slot from 1 to 999");
  }
  const name = `SKY-VM.${slot.padStart(3, "0")}`;
  if (FS.analyzePath(`${destination}/${name}`).exists) return;
  const original = `${source}/${name}`;
  if (!FS.analyzePath(original).exists) throw new Error(`Legacy Sky save slot ${slot} does not exist`);
  const bytes = FS.readFile(original);
  if (bytes.length === 0) throw new Error(`Legacy Sky save slot ${slot} is empty`);
  const descriptions = "SKY-VM.SAV";
  if (FS.analyzePath(`${source}/${descriptions}`).exists && !FS.analyzePath(`${destination}/${descriptions}`).exists) {
    FS.writeFile(`${destination}/${descriptions}`, FS.readFile(`${source}/${descriptions}`));
  }
  const staged = `${destination}/.import-${name}`;
  FS.writeFile(staged, bytes);
  FS.rename(staged, `${destination}/${name}`);
}

export function installAgentControls(scope, saveScope) {
  let tick = 0;
  let maxSaveSlot = 0;
  let paused = false;
  let pending;

  function finish(error) {
    const { resolve, timer } = pending;
    pending = undefined;
    scope.clearTimeout(timer);
    resolve(error ? { error } : { tick, paused });
  }

  scope.scummwebAgentControls = Object.freeze({
    status: () => ({ version: 1, saveScope, tick, paused, maxSaveSlot }),
    run(operation, value, timeoutMs = 10000) {
      if (!maxSaveSlot) return { error: "This game does not support native agent controls" };
      if (pending) return { error: "Another agent control is pending" };
      if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 20000)
        return { error: "Invalid agent control timeout" };
      if (operation === "wait_ticks") {
        if (!Number.isInteger(value) || value < 1 || value > 120)
          return { error: "Tick count must be between 1 and 120" };
      } else if (operation === "save" || operation === "load") {
        if (!Number.isInteger(value) || value < 1 || value > maxSaveSlot)
          return { error: `Save ID must be between 1 and ${maxSaveSlot}` };
        if (operation === "load" && !scope.__scummwebSaveStatus?.saves.some(save => save.slot === value))
          return { error: "Save ID is unavailable in this run" };
      } else if (operation !== "pause" && operation !== "resume") {
        return { error: "Unsupported agent control" };
      }
      return new Promise(resolve => {
        const timer = scope.setTimeout(() => finish("Native agent control timed out"), timeoutMs);
        pending = { operation, value, resolve, timer };
      });
    }
  });

  scope.__scummwebAgentBoundary = (completedTick, maxSlot) => {
    maxSaveSlot = maxSlot;
    if (completedTick) tick++;
    if (pending?.operation === "wait_ticks") {
      pending.target ??= tick + pending.value;
      if (tick < pending.target) return 0;
      // Hold on the boundary that acknowledges the final update.
      paused = true;
      finish();
    } else if (pending?.operation === "pause" || pending?.operation === "resume") {
      paused = pending.operation === "pause";
      finish();
    } else if (pending?.operation === "save" || pending?.operation === "load") {
      return pending.value + (pending.operation === "load" ? maxSaveSlot : 0);
    }
    return paused ? -1 : 0;
  };

  scope.__scummwebAgentSaveResult = error => {
    if (pending?.operation !== "save" && pending?.operation !== "load") return;
    if (!error && pending.operation === "save"
      && !scope.__scummwebSaveStatus?.saves.some(save => save.slot === pending.value)) {
      error = "ScummVM did not confirm the saved slot";
    }
    finish(error);
  };
}
