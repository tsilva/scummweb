const zorkStories = new Set(["zork1", "zork2", "zork3"]);

export function getMobileControlMode({ engineId, gameId } = {}) {
  if (engineId === "grim" && gameId === "grim") return "grim";
  if (engineId === "grim" && gameId === "monkey4") return "monkey4";
  if (engineId === "freescape" && gameId === "castlemaster") return "castle";
  if (engineId === "hugo") return "hugo";
  if (engineId === "adl" || (engineId === "glk" && zorkStories.has(gameId))) return "command";
  return "mouse";
}

export function watchDialogueChoices(frame, onChange, timers = window) {
  let previous;
  function read() {
    let active = false;
    try {
      active = frame?.contentWindow?.scummwebPlayerControls?.read().dialogueActive === true;
    } catch { /* A navigating frame has no current dialogue choices. */ }
    if (active === previous) return;
    previous = active;
    onChange(active);
  }
  frame?.addEventListener("load", read);
  read();
  const timer = timers.setInterval(read, 100);
  return () => {
    timers.clearInterval(timer);
    frame?.removeEventListener("load", read);
  };
}
