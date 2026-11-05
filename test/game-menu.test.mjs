import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { getGameMenuShortcut } from "../app/game-player/game-menu.mjs";

test("native menus use the game's own shortcut without modifiers", () => {
  for (const [engineId, gameId, key, keyCode] of [
    ["sky", "sky", "F5", 116],
    ["queen", "queen", "F1", 112],
    ["sword1", "sword1", "F5", 116],
  ]) {
    assert.deepEqual(getGameMenuShortcut({ engineId, gameId, target: "imported-edition" }), {
      key, code: key, keyCode,
    });
    assert.equal(getGameMenuShortcut({ engineId, target: gameId }).key, key);
  }
});

test("unknown games and shortcuts that can fall back to ScummVM are unsupported", () => {
  for (const game of [
    null, {}, { target: "sky" },
    { engineId: "unknown", gameId: "sky" },
    { engineId: "sky", gameId: "unknown", target: "sky" },
    { engineId: "scumm", gameId: "monkey", original_gui: true },
    { engineId: "scumm", gameId: "monkey", original_gui: false },
    { engineId: "sci", gameId: "phantasmagoria" },
    { engineId: "lure", gameId: "lure" },
    { engineId: "sword2", gameId: "sword2" },
  ]) assert.equal(getGameMenuShortcut(game), null);
});

test("demo and interview editions do not inherit full-game menu support", () => {
  for (const edition of [
    { displayTitle: "Flight of the Amazon Queen (Demo)" },
    { title: "Flight of the Amazon Queen (Demo)" },
    { extra: "Demo" }, { edition: "Interview" },
    { target: "queen-demo" }, { target: "queen_demo" },
  ]) assert.equal(getGameMenuShortcut({ engineId: "queen", gameId: "queen", ...edition }), null);
});

test("only bundled games with native menu support expose the shortcut", async () => {
  const { games } = JSON.parse(await readFile(new URL("../public/games.json", import.meta.url), "utf8"));
  assert.deepEqual(games.filter(getGameMenuShortcut).map(({ target }) => target).sort(), ["queen", "sky"]);
});
