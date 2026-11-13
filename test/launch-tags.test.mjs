import assert from "node:assert/strict";
import test from "node:test";
import library from "../scummvm-shell/games.json" with { type: "json" };
import { getGamePresentation } from "../app/game-presentation.js";
import { getBundledLaunchTags } from "../app/game-player/launch-tags.mjs";
import { getVersionMetadata } from "../app/game-versions.mjs";

test("every bundled game has descriptive launch tags with its year and platform", () => {
  for (const record of library.games) {
    const game = getGamePresentation(record);
    const tags = getBundledLaunchTags(game);
    assert.ok(tags?.length === 4, `${record.target} needs play style, theme, year and platform`);
    assert.equal(tags[2], game.year, record.target);
    const platform = record.target === "sword25" ? "Windows"
      : record.engineId === "glk" ? "Z-machine" : getVersionMetadata(game).platform;
    assert.equal(tags[3], platform, record.target);
    assert.ok(tags.every((tag) => typeof tag === "string" && tag.trim()), record.target);
  }
});

test("the ten newly covered demos have the reviewed play style and theme", () => {
  const themes = {
    "ft-demo": "Biker thriller", "samnmax-demo": "Road-trip comedy", "dig-demo": "Alien archaeology",
    "sword1-demo": "Templar conspiracy", "sword2-demo": "Ancient conspiracy", "dw-demo": "Fantasy comedy",
    "gob1-demo": "Fantasy puzzles", "gob2-demo": "Fantasy puzzles", "gob3-demo": "Surreal fantasy",
    "gk1-demo": "Supernatural mystery",
  };
  for (const [target, theme] of Object.entries(themes)) {
    const game = getGamePresentation(library.games.find((record) => record.target === target));
    assert.deepEqual(getBundledLaunchTags(game).slice(0, 2), ["Point-and-click", theme], target);
  }
});

test("imported and unidentified games retain the launch metadata fallback", () => {
  assert.equal(getBundledLaunchTags({ target: "ft-demo" }), null);
  assert.equal(getBundledLaunchTags({ target: "unidentified", path: "/games/local" }), null);
  assert.equal(getBundledLaunchTags(null), null);
});
