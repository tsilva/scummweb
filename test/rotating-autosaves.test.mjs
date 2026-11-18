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

function player(files = new Map(), query = "hostPlayer=1", failWrite = () => false) {
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
  const resumed = player(files, "hostPlayer=1&continue=1");
  assert.equal(resumed.checkpoint.startup(identity), 1);
  assert.equal(resumed.scope.__scummwebHasIntroCheckpoint("SKY-VM.SAV"), true);
  assert.equal(Buffer.from(files.get("/tmp/scummweb-intro/SKY-VM.001")).toString(), "third");
  assert.equal(files.get(path + "/SKY-VM.001"), "manual bytes");
  assert.equal(resumed.checkpoint.due(), true);
  assert.equal(resumed.scope.__scummwebHasIntroCheckpoint, undefined);
  const tried = ordered[1].split("/").at(-1);
  assert.equal(player(files, "hostPlayer=1&continue=1&excludeAutosaves=" + tried).checkpoint.startup(identity), 1);
  assert.equal(Buffer.from(files.get("/tmp/scummweb-intro/SKY-VM.001")).toString(), "second");
});

test("failed native capture and browser quota cannot replace an intact checkpoint", () => {
  const { files, checkpoint } = player();
  assert.equal(checkpoint.save(payload("intact"), 1), true);
  const before = new Map(files);
  const rejected = player(files, "hostPlayer=1", key => key.includes(name));
  assert.equal(rejected.checkpoint.save({ status: "failed", files: [] }, 1), false);
  assert.equal(rejected.checkpoint.save(payload("replacement"), 1), false);
  assert.deepEqual(files, before);
  assert.equal(player(files, "hostPlayer=1&continue=1&agentSaveScope=fixture").checkpoint.startup(identity), -1);
});
