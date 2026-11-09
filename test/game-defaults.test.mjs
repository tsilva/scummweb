import assert from "node:assert/strict";
import test from "node:test";
import { applyGameDefaults } from "../web-shell/game-defaults.mjs";

test("existing browser configuration gains original screen defaults without changing game settings", () => {
  const game = "[pq1sci]\nengineid=sci\ngameid=pq1sci\npath=/games/pq1sci\noriginalsaveload=false\n";
  const config = "# Browser settings\n[scummvm]\nsavepath=/custom/saves\nmusic_volume=120\n\n" + game;
  const updated = applyGameDefaults(config);
  assert.equal(updated, "# Browser settings\n[scummvm]\noriginalsaveload=true\noriginal_gui=true\noriginal_menus=true\nsavepath=/custom/saves\nmusic_volume=120\n\n" + game);
  assert.equal(applyGameDefaults(updated), updated, "repeat launches do not duplicate defaults");
});

test("explicit application choices are preserved while missing defaults are added", () => {
  const updated = applyGameDefaults("[scummvm]\noriginalsaveload = false\noriginal_gui=false\n\n[sky]\ngameid=sky\n");
  assert.equal(updated, "[scummvm]\noriginal_menus=true\noriginalsaveload = false\noriginal_gui=false\n\n[sky]\ngameid=sky\n");
});

test("personal imports and configurations without an application section receive the defaults", () => {
  for (const config of ["", "[local-game]\nengineid=mads\npath=/local-game\n"]) {
    const updated = applyGameDefaults(config);
    assert.equal(updated, "[scummvm]\noriginalsaveload=true\noriginal_gui=true\noriginal_menus=true\n\n" + config);
    assert.equal(applyGameDefaults(updated), updated);
  }
});

test("Windows line endings and a final header without a newline remain valid", () => {
  assert.equal(applyGameDefaults("[scummvm]\r\nsavepath=/saves\r\n"),
    "[scummvm]\r\noriginalsaveload=true\r\noriginal_gui=true\r\noriginal_menus=true\r\nsavepath=/saves\r\n");
  assert.equal(applyGameDefaults("[scummvm]"),
    "[scummvm]\noriginalsaveload=true\noriginal_gui=true\noriginal_menus=true\n");
});
