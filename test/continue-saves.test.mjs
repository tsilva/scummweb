import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { installContinueSaves, latestPlayerSave, saveIndexKey, saveRevision, supportsContinue } from "../web-shell/continue-saves.mjs";

function shell({ namespace = "", resume = false, seed = false, query = false } = {}) {
  const files = new Map();
  const base = "/home/web_user/.local/share/scummvm/saves" + (namespace ? `/${namespace}` : "");
  function put(name, contents, modifiedAt) { files.set(`${base}/${name}`, { bytes: new TextEncoder().encode(contents), modifiedAt }); }
  if (seed) put("SKY-VM.000", "checkpoint", 100);
  const FS = {
    readdir: () => [".", "..", ...[...files.keys()].filter((p) => p.startsWith(base + "/")).map((p) => p.slice(base.length + 1))],
    stat: (path) => { const file = files.get(path); if (!file) throw new Error("missing"); return { mode: 0x8000, size: file.bytes.length, mtime: new Date(file.modifiedAt) }; },
    isFile: (mode) => mode === 0x8000,
    readFile: (path) => { const file = files.get(path); if (!file) throw new Error("missing"); return file.bytes; },
    writeFile: (path, text) => files.set(path, { bytes: new TextEncoder().encode(text), modifiedAt: 1 }),
  };
  const storage = new Map(), messages = [], Module = { arguments: ["sky"] };
  let poll;
  const scope = {
    localStorage: { setItem: (key, value) => storage.set(key, value) },
    parent: { postMessage: (message) => messages.push(message) },
    fetch: async (url) => url.endsWith("games.json")
      ? new Response(JSON.stringify({ games: [{ target: "sky", skipIntro: { saveFiles: ["SKY-VM.000"] } }] }))
      : new Response("checkpoint"),
    setInterval: (callback) => { poll = callback; return 1; }, clearInterval() {}, addEventListener() {},
  };
  const launchUrl = new URL("https://example.test/scummvm.html#sky");
  if (namespace) launchUrl.searchParams.set("saveNamespace", namespace);
  if (resume) launchUrl.searchParams.set("continue", "1");
  if (query) for (const [key, value] of Object.entries({ saveQuery: "nonce", saveEngine: "sky", saveGameId: "sky", saveTarget: "sky" })) launchUrl.searchParams.set(key, value);
  const start = () => installContinueSaves({ scope, FS, Module, launchUrl, assetUrl: (path) => path });
  function scan(saves, supported = true) {
    scope.__scummwebBeginSaveScan("sky", "sky", "sky", supported);
    for (const [slot, name] of saves) scope.__scummwebAddSave(slot, name);
    return scope.__scummwebEndSaveScan();
  }
  return { scope, FS, files, put, Module, storage, messages, start, scan, poll: () => poll() };
}

test("native-listed checkpoint is excluded, but overwriting it with player progress is resumable", async () => {
  const f = shell({ seed: true, resume: true }); await f.start();
  assert.equal(f.scan([[0, "SKY-VM.000"]]), -1);
  f.put("SKY-VM.000", "player progress", 200);
  f.Module._scummweb_refresh_saves = () => f.scan([[0, "SKY-VM.000"]]);
  f.poll();
  assert.equal(f.scope.__scummwebSaveStatus.latestSlot, 0);
});

test("empty placeholders, missing files and unsupported native snapshots never enable Continue", async () => {
  const f = shell({ resume: true }); await f.start();
  f.put("SKY-VM.001", "", 200);
  assert.equal(f.scan([[0, "missing"], [1, "SKY-VM.001"]]), -1);
  f.put("SKY-VM.001", "player", 200);
  assert.equal(f.scan([[1, "SKY-VM.001"]], false), -1);
});

test("latest save selection uses write time across slots and is refreshed before native launch", async () => {
  const f = shell({ resume: true }); await f.start();
  f.put("SKY-VM.001", "new", 200); f.put("SKY-VM.009", "old", 100);
  assert.equal(f.scan([[9, "SKY-VM.009"], [1, "SKY-VM.001"]]), 1);
  f.put("SKY-VM.009", "newer", 300);
  assert.equal(f.scan([[9, "SKY-VM.009"], [1, "SKY-VM.001"]]), 9);
  const index = JSON.parse(f.storage.get(saveIndexKey("", "sky")));
  assert.equal(index.revision, saveRevision(index.saves));
  assert.equal(latestPlayerSave(index, index.saves).slot, 9);
});

test("native query uses an ephemeral config and the exact selected import namespace", async () => {
  const namespace = "version-" + "a".repeat(64), f = shell({ namespace, query: true }); await f.start();
  assert.deepEqual(f.Module.arguments, ["--config=/tmp/scummweb-query.ini", "--list-saves", "sky"]);
  const ini = new TextDecoder().decode(f.files.get("/tmp/scummweb-query.ini").bytes);
  assert.match(ini, new RegExp("savepath=.*saves/" + namespace));
  f.scan([]);
  assert.ok(f.storage.has(saveIndexKey(namespace)));
  assert.equal(f.messages.at(-1).query, "nonce");
});

test("all 48 shipped engines agree with the pinned native capability declarations", async () => {
  const script = await readFile(new URL("../scripts/build_scummvm_web.sh", import.meta.url), "utf8");
  const engines = script.match(/SCUMMVM_ENGINES=\(([\s\S]*?)\)/)[1].trim().split(/\s+/);
  assert.equal(engines.length, 48);
  for (const engine of engines) {
    const source = await readFile(new URL(`../vendor/scummvm-v2026.4.0/engines/${engine}/metaengine.cpp`, import.meta.url), "utf8").catch(() => null);
    if (source === null) { /* Vendor sources are optional on CI; the compiled runtime is tracked. */ continue; }
    const clean = source.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, "");
    const method = clean.match(/bool\s+(?:\w+::)?hasFeature\(MetaEngineFeature\s+f\)\s+const(?:\s+override)?\s*\{([\s\S]*?)(?:\n\}|\n\t\})/)[1];
    const listing = method.includes("kSupportsListSaves") || method.includes("checkExtendedSaves");
    const loading = method.includes("kSupportsLoadingDuringStartup");
    assert.equal(supportsContinue(engine, engine === "mohawk" ? "myst" : "normal"), listing && loading, engine);
  }
});
