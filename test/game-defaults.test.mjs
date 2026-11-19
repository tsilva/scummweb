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

test("hosted player launch restores music and effects even with saved per-game overrides", () => {
  const config = ["[scummvm]", "music_volume=0", " mute = true", "music_driver=null", "",
    "[sky]", "music_mute=true", "SFX_VOLUME = 20", "sfx_mute=true", "music_driver=adlib", "save_slot=1", "",
    "[local-game]", "music_driver = null", "speech_volume=90", "speech_mute=true", "# music_volume=0"].join("\r\n");
  const settings = { useMasterVolume: true };
  const updated = applyGameDefaults(config, settings);
  assert.equal(updated, ["[scummvm]", "originalsaveload=true", "original_gui=true", "original_menus=true",
    "sfx_volume=255", "music_mute=false", "sfx_mute=false", "music_volume=255", "mute=false", "music_driver=auto", "",
    "[sky]", "music_mute=false", "sfx_volume=255", "sfx_mute=false", "music_driver=adlib", "save_slot=1", "",
    "[local-game]", "music_driver=auto", "speech_volume=90", "speech_mute=true", "# music_volume=0"].join("\r\n"));
  assert.equal(applyGameDefaults(updated, settings), updated);
  assert.match(applyGameDefaults(config), /music_volume=0\r\n mute = true\r\nmusic_driver=null/);
});

test("hosted imports without [scummvm] inherit the same music and effects levels", () => {
  const config = "[local-game]\ngameid=sky\n";
  const updated = applyGameDefaults(config, { useMasterVolume: true });
  const [application] = updated.split("[local-game]");
  assert.match(application, /music_volume=255\nsfx_volume=255\nmute=false\nmusic_mute=false\nsfx_mute=false\n/);
  assert.ok(updated.endsWith(config));
});
