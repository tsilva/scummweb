const zorkStories = new Set(["zork1", "zork2", "zork3"]);

export function getMobileControlMode({ engineId, gameId } = {}) {
  if (engineId === "grim" && gameId === "grim") return "grim";
  if (engineId === "freescape" && gameId === "castlemaster") return "castle";
  if (engineId === "hugo") return "hugo";
  if (engineId === "adl" || (engineId === "glk" && zorkStories.has(gameId))) return "command";
  return "mouse";
}
