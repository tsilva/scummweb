import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import vm from "node:vm";
import test from "node:test";

const source = fs.readFileSync(new URL("../scummvm-shell/scummvm.js", import.meta.url), "utf8");
const adapter = new URL("../scripts/patch_scummvm_speech.py", import.meta.url).pathname;
const names = ["ttsInit", "_ttsSay", "_ttsStop", "__asyncjs___ttsPause", "_ttsResume", "_ttsIsSpeaking", "_ttsIsPaused"];
const glue = names.map(name => {
  const start = source.indexOf(`function ${name}(`);
  const end = source.indexOf(`${name}.sig=`, start);
  assert.ok(start >= 0 && end > start && end - start < 5000, name);
  return source.slice(start, end);
}).join(";");

function runtime(speechSynthesis, utterance) {
  const scope = { window: { speechSynthesis }, console: { log() {}, debug() {}, error() {}, assert() {} },
    UTF8ToString: value => value, Asyncify: { handleAsync: fn => fn() }, assert: value => assert.ok(value),
  };
  if (utterance) scope.SpeechSynthesisUtterance = utterance;
  vm.createContext(scope);
  vm.runInContext(glue, scope);
  return scope;
}

test("missing speech APIs leave an empty voice list and permit native cleanup", () => {
  for (const speech of [undefined, null, {}]) {
    const r = runtime(speech);
    r.ttsInit();
    assert.deepEqual(Object.keys(r.ttsVoiceMap), []);
    assert.equal(r._ttsSay("text", "voice", "en", 0, 0, 100, 0), false);
    {
      r._ttsStop(); r._ttsResume(); r.__asyncjs___ttsPause();
      assert.equal(r._ttsIsSpeaking(), false);
      assert.equal(r._ttsIsPaused(), false);
    }
  }
});

test("supported browser speech retains voice discovery, speech and controls", () => {
  const calls = [];
  const voice = { lang: "en-US", name: "Test voice" };
  const synthesis = { onvoiceschanged: null, speaking: false, paused: false,
    getVoices: () => [voice], cancel: () => calls.push("cancel"),
    resume: () => calls.push("resume"), pause: () => calls.push("pause"),
    speak: utterance => calls.push(utterance),
  };
  const r = runtime(synthesis, class { constructor(text) { this.text = text; } });
  r.speechSynthesis = synthesis;
  r.ttsInit();
  assert.equal(r.ttsVoiceMap["en-US"]["Test voice"], voice);
  assert.equal(typeof synthesis.onvoiceschanged, "function");
  assert.equal(r._ttsSay("hello", "Test voice", "en-US", 0, 0, 100, 0), true);
  assert.equal(calls[1].text, "hello");
  assert.equal(calls[1].voice, voice);
  r._ttsStop(); r._ttsResume();
  assert.deepEqual(calls.filter(call => typeof call === "string"), ["cancel", "cancel", "resume"]);
  synthesis.getVoices = () => { throw Error("voice service failure"); };
  assert.throws(() => synthesis.onvoiceschanged(), /voice service failure/);
});

test("speech adapter is idempotent and fails closed on unrecognized glue", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "scummweb-speech-"));
  const file = path.join(dir, "scummvm.js");
  try {
    fs.writeFileSync(file, source);
    assert.equal(spawnSync("python3", [adapter, file]).status, 0);
    assert.equal(fs.readFileSync(file, "utf8"), source);
    fs.writeFileSync(file, "unsupported glue");
    assert.notEqual(spawnSync("python3", [adapter, file]).status, 0);
    assert.equal(fs.readFileSync(file, "utf8"), "unsupported glue");
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
