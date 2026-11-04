import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import test from "node:test";
import swc from "next/dist/build/swc/index.js";

const moduleUrl = new URL("../app/home-shell/zip-game-player.js", import.meta.url);
await swc.loadBindings();
const { code } = await swc.transform(await readFile(moduleUrl, "utf8"), {
  filename: moduleUrl.pathname, swcrc: false, configFile: false, module: { type: "commonjs" },
});
const compiled = { exports: {} };
const require = createRequire(moduleUrl);
runInNewContext(code, { module: compiled, exports: compiled.exports, window: { location: { origin: "https://example.test" } },
  require: (name) => name === "../asset-paths" ? { buildVersionedAssetPath: (path, options) => ({ path, ...options }) } : require(name) });
const { buildZipGamePlayerUrl, sendZipGameFiles } = compiled.exports;
const saveNamespace = "version-" + "a".repeat(64);
const savePath = `/home/web_user/.local/share/scummvm/saves/${saveNamespace}`;

test("the version save folder exists before files release ScummVM's startup dependency", () => {
  const events = [];
  const files = [{ path: "game.dat", data: new Uint8Array([1, 2]) }];
  const player = { FS: { mkdirTree(path) { events.push(["mkdir", path]); } },
    postMessage(message, origin, transfers) { events.push(["handoff", message.type, origin, transfers[0]]); } };
  sendZipGameFiles(player, files, { saveNamespace });
  assert.equal(events[0][0], "mkdir");
  assert.equal(events[0][1], savePath);
  assert.equal(events[1][1], "scummweb:local-game-files");
  assert.equal(events[1][3], files[0].data.buffer);
  assert.match(buildZipGamePlayerUrl("/#library", { saveNamespace }).hash, new RegExp(`--savepath=${savePath}$`));
});

test("invalid or inaccessible save folders prevent file handoff; legacy launches keep their default folder", () => {
  let sent = false;
  const player = { FS: { mkdirTree() { throw new Error("Storage unavailable"); } }, postMessage() { sent = true; } };
  assert.throws(() => sendZipGameFiles(player, [], { saveNamespace }), /Storage unavailable/);
  assert.equal(sent, false);
  assert.throws(() => buildZipGamePlayerUrl("/", { saveNamespace: "../elsewhere" }), /Invalid game save namespace/);
  assert.equal(buildZipGamePlayerUrl("/").hash.includes("--savepath"), false);
  sendZipGameFiles(player, []);
  assert.equal(sent, true);
});
