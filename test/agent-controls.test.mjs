import assert from "node:assert/strict";
import test from "node:test";
import { importLegacySkySave, installAgentControls } from "../web-shell/agent-controls.mjs";
import { withGameTelemetry } from "../app/game-player/telemetry.mjs";

test("agent controls stop on the exact game tick and acknowledge native saves", async () => {
  const scope = { setTimeout, clearTimeout };
  installAgentControls(scope, "a".repeat(64));
  const controls = scope.scummwebAgentControls;
  const boundary = (completed = false) => scope.__scummwebAgentBoundary(completed, 99);
  assert.match(controls.run("pause").error, /does not support/);
  assert.equal(boundary(), 0);
  assert.equal(controls.status().queueInputBeforeResume, true);
  const pause = controls.run("pause");
  assert.equal(boundary(true), -1);
  assert.deepEqual(await pause, { tick: 1, paused: true });

  const advance = controls.run("wait_ticks", 3);
  assert.equal(boundary(), 0);
  assert.equal(boundary(true), 0);
  assert.equal(boundary(true), 0);
  assert.equal(boundary(true), -1);
  assert.equal(boundary(), -1);
  assert.deepEqual(await advance, { tick: 4, paused: true });

  assert.match(controls.run("load", 7).error, /unavailable in this run/);
  const save = controls.run("save", 7);
  assert.equal(boundary(), 7);
  scope.__scummwebSaveStatus = { saves: [{ slot: 7 }] };
  scope.__scummwebAgentSaveResult("");
  assert.deepEqual(await save, { tick: 4, paused: true });
  const load = controls.run("load", 7);
  assert.equal(boundary(), 106);
  scope.__scummwebAgentSaveResult("");
  assert.deepEqual(await load, { tick: 4, paused: true });
  assert.match((await controls.run("resume", undefined, 5)).error, /timed out/);
  assert.equal(boundary(), -1);
});

test("scoped save launch parameters propagate only within the ScummWEB origin", () => {
  const scope = "a".repeat(64);
  const route = `https://scummweb.test/sky/play?agentSaveScope=${scope}&unrelated=1`;
  assert.equal(withGameTelemetry("/scummvm.html?continue=1#sky", route),
    `/scummvm.html?continue=1&agentSaveScope=${scope}#sky`);
  assert.equal(withGameTelemetry("https://other.test/scummvm.html", route), "https://other.test/scummvm.html");
});

test("shared frame control can advertise timing without a save API", async () => {
  const scope = { setTimeout, clearTimeout };
  installAgentControls(scope, "b".repeat(64));
  const controls = scope.scummwebAgentControls;
  const frame = (completed = true) => scope.__scummwebAgentFrameBoundary(completed, 0, 0, false, false);
  assert.equal(frame(), 0);
  assert.deepEqual(controls.status().actions, ["pause", "resume", "wait_ticks"]);
  assert.equal(controls.status().tickSource, "frame");
  assert.match(controls.run("load", 1).error, /does not support/);

  const pause = controls.run("pause");
  assert.equal(frame(), -1);
  assert.deepEqual(await pause, { tick: 2, paused: true });
  const wait = controls.run("wait_ticks", 2);
  assert.equal(frame(false), 0);
  assert.equal(frame(), 0);
  assert.equal(frame(), -1);
  assert.deepEqual(await wait, { tick: 4, paused: true });

  scope.__scummwebAgentFrameBoundary(false, 10, 5, true, false);
  assert.match(controls.run("save", 5).error, /manual slot/);
  const save = controls.run("save", 7);
  assert.equal(scope.__scummwebAgentFrameBoundary(false, 10, 5, true, false), 7);
  scope.__scummwebAgentSaveResult(null);
  assert.deepEqual(await save, { tick: 4, paused: true });
});

test("shared game-loop controls use engine ticks and native slot confirmation", async () => {
  const scope = { setTimeout, clearTimeout };
  installAgentControls(scope, "c".repeat(64));
  const controls = scope.scummwebAgentControls;
  const loop = (completed = false) => scope.__scummwebAgentFrameBoundary(completed, 9, 0, true, true, true);
  assert.equal(loop(true), 0);
  assert.equal(controls.status().tickSource, "engine");
  assert.equal(controls.status().queueInputBeforeResume, false);

  const save = controls.run("save", 4);
  assert.equal(loop(), 4);
  scope.__scummwebAgentSaveResult(null);
  assert.deepEqual(await save, { tick: 1, paused: false });

  const load = controls.run("load", 4);
  assert.equal(loop(), 13);
  scope.__scummwebAgentSaveResult(null);
  assert.deepEqual(await load, { tick: 1, paused: false });
});

test("legacy Sky Continue copies only the requested slot without replacing a scoped save", () => {
  const files = new Map([
    ["/legacy/SKY-VM.002", Uint8Array.of(2)], ["/legacy/SKY-VM.003", Uint8Array.of(3)],
    ["/legacy/SKY-VM.SAV", Uint8Array.of(4)],
  ]);
  const FS = {
    analyzePath: path => ({ exists: files.has(path) }),
    readFile: path => files.get(path),
    writeFile: (path, data) => files.set(path, data.slice()),
    rename: (from, to) => { files.set(to, files.get(from)); files.delete(from); },
  };
  const params = new URLSearchParams("agentLegacySkySlot=2&catalogGame=sky&continue=1");
  importLegacySkySave(FS, params, "/legacy", "/run");
  assert.deepEqual(files.get("/run/SKY-VM.002"), Uint8Array.of(2));
  assert.equal(files.has("/run/SKY-VM.003"), false);
  assert.deepEqual(files.get("/run/SKY-VM.SAV"), Uint8Array.of(4));
  files.set("/run/SKY-VM.002", Uint8Array.of(5));
  importLegacySkySave(FS, params, "/legacy", "/run");
  assert.deepEqual(files.get("/run/SKY-VM.002"), Uint8Array.of(5));
  assert.deepEqual(files.get("/legacy/SKY-VM.002"), Uint8Array.of(2));
  params.set("agentLegacySkySlot", "9");
  assert.throws(() => importLegacySkySave(FS, params, "/legacy", "/run"), /slot 9 does not exist/);
});
