import assert from "node:assert/strict";
import test from "node:test";
import { installRotatingAutosaves, parseAutosave } from "../web-shell/rotating-autosaves.mjs";

const identity = { engineId: "sky", gameId: "sky", target: "sky", extra: "", supported: true };
const path = "/saves";
const data = new TextEncoder();
const name = ".scummweb-autosave.";
const payload = (state) => ({ status: "captured", files: [
  { name: "SKY-VM.001", data: data.encode(state) },
  { name: "SKY-VM.SAV", data: data.encode("companion") },
] });

const preview = "hostPlayer=1&dropbox=true";

function player(files = new Map(), query = preview, failWrite = () => false) {
  const scope = { __scummwebReadyState: { state: "ready" }, __scummwebSaveStatus: identity };
  const fs = { mkdir() {}, readFile(key) { return files.get(key); }, writeFile(key, value) {
    if (failWrite(key)) throw new Error("quota");
    files.set(key, value);
  }, unlink(key) { files.delete(key); } };
  return { files, scope, checkpoint: installRotatingAutosaves(scope, fs, path, new URLSearchParams(query)) };
}

test("rotation keeps three independent checkpoints and restores the newest intact one with its companions", () => {
  const { files, checkpoint } = player(new Map([[path + "/SKY-VM.001", "manual bytes"]]));
  assert.equal(checkpoint.due(), false);
  checkpoint.afterLoad();
  assert.equal(checkpoint.due(), true);
  for (const state of ["first", "second", "third", "fourth"]) assert.equal(checkpoint.save(payload(state), 1), true);
  const ring = [...files.keys()].filter(key => key.includes(name));
  assert.equal(ring.length, 3);
  const ordered = ring.sort((a, b) => parseAutosave(files.get(b)).savedAt - parseAutosave(files.get(a)).savedAt);
  files.set(ordered[0], files.get(ordered[0]).slice(0, -1));
  const resumed = player(files, preview + "&continue=1");
  assert.equal(resumed.checkpoint.startup(identity), 1);
  assert.equal(resumed.scope.__scummwebHasIntroCheckpoint("SKY-VM.SAV"), true);
  assert.equal(Buffer.from(files.get("/tmp/scummweb-intro/SKY-VM.001")).toString(), "third");
  assert.equal(files.get(path + "/SKY-VM.001"), "manual bytes");
  assert.equal(resumed.checkpoint.due(), true);
  assert.equal(resumed.scope.__scummwebHasIntroCheckpoint, undefined);
  const tried = ordered[1].split("/").at(-1);
  assert.equal(player(files, preview + "&continue=1&excludeAutosaves=" + tried).checkpoint.startup(identity), 1);
  assert.equal(Buffer.from(files.get("/tmp/scummweb-intro/SKY-VM.001")).toString(), "second");
});

test("failed native capture and browser quota cannot replace an intact checkpoint", () => {
  const { files, checkpoint } = player();
  assert.equal(checkpoint.save(payload("intact"), 1), true);
  const before = new Map(files);
  const rejected = player(files, preview, key => key.includes(name));
  assert.equal(rejected.checkpoint.save({ status: "failed", files: [] }, 1), false);
  assert.equal(rejected.checkpoint.save(payload("replacement"), 1), false);
  assert.deepEqual(files, before);
  assert.equal(player(files, preview + "&continue=1&agentSaveScope=fixture").checkpoint.startup(identity), -1);
});

test("ordinary game launches neither load nor replace preview checkpoints", () => {
  const { files, checkpoint } = player();
  assert.equal(checkpoint.save(payload("preview progress"), 1), true);
  const before = new Map(files);
  for (const query of ["hostPlayer=1&continue=1", "hostPlayer=1&continue=1&dropbox=false", "hostPlayer=1&continue=1&dropbox=1"]) {
    const regular = player(files, query).checkpoint;
    regular.afterLoad();
    assert.equal(regular.due(), false);
    assert.equal(regular.startup(identity), -1);
    assert.equal(regular.save(payload("ordinary progress"), 1), false);
  }
  assert.deepEqual(files, before);
});

for (const { engineId, gameId, target, extra, filename, gameplayBoundary, catalog } of [
  { engineId: "scumm", gameId: "atlantis", target: "atlantis-demo", extra: "Demo", filename: "atlantis-demo.s01" },
  { engineId: "agos", gameId: "elvira1", target: "elvira1", extra: "", filename: "elvira1.001" },
  { engineId: "agos", gameId: "elvira2", target: "elvira2", extra: "", filename: "elvira2-pc.001" },
  { engineId: "drascula", gameId: "drascula", target: "drascula", extra: "", filename: "drascula.001", gameplayBoundary: true, catalog: true },
  { engineId: "lure", gameId: "lure", target: "lure-vga", extra: "VGA", filename: "lure.001", gameplayBoundary: true },
  { engineId: "kyra", gameId: "lol", target: "lol-demo", extra: "cd/demo", filename: "lol-demo.001", gameplayBoundary: true, catalog: true },
]) test(`${gameId} keeps the rotating checkpoint after its early ready frame`, () => {
  const detected = { engineId, gameId, target, extra, supported: true };
  const manualPath = `${path}/${filename}`;
  const temporaryPath = `/tmp/scummweb-intro/${filename}`;
  const original = player(new Map([[manualPath, "older manual position"]]));
  original.scope.__scummwebSaveStatus = detected;
  assert.equal(original.checkpoint.save({ status: "captured", files: [
    { name: filename, data: data.encode("newer exit position") },
  ] }, 1), true);

  const resumed = player(original.files, preview + "&continue=1");
  resumed.scope.__scummwebSaveStatus = detected;
  let reports = 0;
  if (catalog) resumed.scope.__scummwebReportGameplayStarted = () => reports++;
  assert.equal(resumed.checkpoint.startup(detected), 1);
  assert.equal(resumed.checkpoint.due(), false);
  assert.equal(resumed.checkpoint.canCapture(), false);
  assert.equal(resumed.scope.__scummwebHasIntroCheckpoint(filename), true);
  assert.equal(Buffer.from(resumed.files.get(temporaryPath)).toString(), "newer exit position");

  if (gameplayBoundary) {
    resumed.scope.__scummwebReportGameplayStarted();
    assert.equal(resumed.scope.__scummwebReportGameplayStarted, undefined);
    assert.equal(reports, catalog ? 1 : 0);
  } else resumed.checkpoint.finishNativeStartup();
  assert.equal(resumed.scope.__scummwebHasIntroCheckpoint, undefined);
  assert.equal(resumed.files.has(temporaryPath), false);
  assert.equal(resumed.files.get(manualPath), "older manual position");
  assert.equal(resumed.checkpoint.due(), true);
});

test("Lands of Lore can retry a rejected startup checkpoint through the next eligible save", () => {
  const detected = { engineId: "kyra", gameId: "lol", target: "lol-demo", extra: "cd/demo", supported: true };
  const filename = "lol-demo.001";
  const temporaryPath = `/tmp/scummweb-intro/${filename}`;
  const original = player(new Map([[`${path}/${filename}`, "manual bytes"]]));
  original.scope.__scummwebSaveStatus = detected;
  for (const state of ["older playable state", "newer rejected state"]) {
    assert.equal(original.checkpoint.save({
      status: "captured", files: [{ name: filename, data: data.encode(state) }],
    }, 1), true);
  }
  const resumed = player(new Map(original.files), preview + "&continue=1");
  assert.equal(resumed.checkpoint.startup(detected, { slot: 1, modifiedAt: 0 }), 1);
  assert.equal(resumed.checkpoint.landsOfLoreStartupSlot(), 1);
  assert.equal(Buffer.from(resumed.files.get(temporaryPath)).toString(), "newer rejected state");
  assert.equal(resumed.checkpoint.retryLandsOfLoreStartup(), 1);
  assert.equal(Buffer.from(resumed.files.get(temporaryPath)).toString(), "older playable state");
  assert.equal(resumed.checkpoint.canCapture(), false);
  assert.equal(resumed.checkpoint.retryLandsOfLoreStartup(), 1);
  assert.equal(resumed.files.has(temporaryPath), false);
  assert.equal(resumed.files.get(`${path}/${filename}`), "manual bytes");
  assert.equal(resumed.checkpoint.canCapture(), false);
  assert.equal(resumed.checkpoint.retryLandsOfLoreStartup(), -1);
  resumed.scope.__scummwebReportGameplayStarted();
  assert.equal(resumed.checkpoint.landsOfLoreStartupSlot(), -1);
  assert.equal(resumed.checkpoint.canCapture(), true);
});
