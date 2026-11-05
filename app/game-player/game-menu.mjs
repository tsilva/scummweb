// Only native game interfaces belong here. In particular, SCUMM's F5 can
// fall back to the ScummVM menu depending on the edition and saved settings.
// Source: engines/sky/metaengine.cpp, engines/queen/input.cpp and
// engines/sword1/metaengine.cpp in the pinned ScummVM source.
const shortcuts = new Map([
  ["sky:sky", Object.freeze({ key: "F5", code: "F5", keyCode: 116 })],
  ["queen:queen", Object.freeze({ key: "F1", code: "F1", keyCode: 112 })],
  ["sword1:sword1", Object.freeze({ key: "F5", code: "F5", keyCode: 116 })],
]);

export function getGameMenuShortcut(game) {
  if (!game) return null;
  // Demo/interview editions can omit the full game's menu entirely.
  const edition = [game.target, game.displayTitle, game.title, game.extra, game.edition].join(" ");
  if (/(?:^|[^a-z])(?:demo|interview)(?:[^a-z]|$)/i.test(edition)) return null;
  return shortcuts.get(`${game.engineId}:${game.gameId || game.target}`) || null;
}
