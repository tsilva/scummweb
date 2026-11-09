import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { installContinueSaves, latestPlayerSave, saveIndexKey, saveRevision, supportsContinue } from "../web-shell/continue-saves.mjs";

function shell({ namespace = "", agentSaveScope, resume = false, seed = false, query = false,
  storage = new Map(), files = new Map() } = {}) {
  const normal = "/home/web_user/.local/share/scummvm/saves";
  const base = agentSaveScope ? `${normal}-agent/${agentSaveScope}` : normal + (namespace ? `/${namespace}` : "");
  function put(name, contents, modifiedAt) { files.set(`${base}/${name}`, { bytes: new TextEncoder().encode(contents), modifiedAt }); }
  if (seed) put("SKY-VM.000", "checkpoint", 100);
  const FS = {
    readdir: (directory) => [".", "..", ...[...files.keys()].filter((p) => p.startsWith(directory + "/"))
      .map((p) => p.slice(directory.length + 1)).filter((p) => !p.includes("/"))],
    stat: (path) => { const file = files.get(path); if (!file) throw new Error("missing"); return { mode: 0x8000, size: file.bytes.length, mtime: new Date(file.modifiedAt) }; },
    isFile: (mode) => mode === 0x8000,
    readFile: (path) => { const file = files.get(path); if (!file) throw new Error("missing"); return file.bytes; },
    writeFile: (path, text) => files.set(path, { bytes: new TextEncoder().encode(text), modifiedAt: 1 }),
  };
  const messages = [], Module = { arguments: ["sky"] };
  let poll;
  const scope = {
    localStorage: { getItem: (key) => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value) },
    parent: { postMessage: (message) => messages.push(message) },
    fetch: async (url) => url.endsWith("games.json")
      ? new Response(JSON.stringify({ games: [{ target: "sky", skipIntro: { saveFiles: ["SKY-VM.000"] } }] }))
      : new Response("checkpoint"),
    setInterval: (callback) => { poll = callback; return 1; }, clearInterval() {}, addEventListener() {},
  };
  const launchUrl = new URL("https://example.test/scummvm.html#sky");
  if (namespace) launchUrl.searchParams.set("saveNamespace", namespace);
  if (agentSaveScope) launchUrl.searchParams.set("agentSaveScope", agentSaveScope);
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

test("agent Continue sees only its own native files and never publishes a library listing", async () => {
  const agentSaveScope = "a".repeat(64), slot = [[7, "SKY-VM.007"]];
  const original = shell({ agentSaveScope, resume: true });
  const shared = { storage: original.storage, files: original.files, resume: true };
  original.put("SKY-VM.007", "player", 200);
  await original.start();
  assert.equal(original.scan(slot), 7);
  assert.equal(original.messages.length, 0);
  assert.ok(original.storage.has(saveIndexKey(`agent-${agentSaveScope}`)));
  assert.equal(original.storage.has(saveIndexKey("", "sky")), false);

  for (const scope of ["b".repeat(64), undefined, agentSaveScope]) {
    const reopened = shell({ ...shared, agentSaveScope: scope });
    await reopened.start();
    assert.equal(reopened.scan(slot), scope === agentSaveScope ? 7 : -1);
  }
});

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
  assert.equal(supportsContinue("mohawk", "myst", "Demo"), false);
});

test("the managed Wasm actually exports the native save bridge", async () => {
  const bytes = await readFile(new URL("../scummvm-shell/scummvm.wasm", import.meta.url));
  const exports = WebAssembly.Module.exports(new WebAssembly.Module(bytes));
  assert.ok(exports.some(({ name, kind }) => name === "scummweb_refresh_saves" && kind === "function"));
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
  assert.deepEqual(f.Module.arguments, ["--config=/tmp/scummweb-query.ini", "sky"]);
  const ini = new TextDecoder().decode(f.files.get("/tmp/scummweb-query.ini").bytes);
  assert.match(ini, new RegExp("savepath=.*saves/" + namespace));
  f.scan([]);
  assert.ok(f.storage.has(saveIndexKey(namespace)));
  assert.equal(f.messages.at(-1).query, "nonce");
});

test("all shipped engines agree with the pinned native capability declarations", async () => {
  const script = await readFile(new URL("../scripts/build_scummvm_web.sh", import.meta.url), "utf8");
  const engines = script.match(/SCUMMVM_ENGINES=\(([\s\S]*?)\)/)[1].trim().split(/\s+/);
  assert.ok(engines.includes("adl") && engines.includes("got"));
  for (const engine of engines) {
    const source = await readFile(new URL(`../vendor/scummvm-v2026.4.0/engines/${engine}/metaengine.cpp`, import.meta.url), "utf8").catch(() => null);
    if (source === null) { /* Vendor sources are optional on CI; the compiled runtime is tracked. */ continue; }
    const clean = source.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, "");
    const featureMethod = /bool\s+(?:\w+::)?hasFeature\(MetaEngineFeature\s+f\)\s+const(?:\s+override)?\s*\{([\s\S]*?)(?:\n\}|\n\t\})/;
    let method = clean.match(featureMethod)?.[1];
    if (!method && engine === "freescape") {
      assert.match(clean, /class FreescapeMetaEngine : public AdvancedMetaEngine</);
      const base = await readFile(new URL("../vendor/scummvm-v2026.4.0/engines/metaengine.cpp", import.meta.url), "utf8");
      method = base.match(featureMethod)?.[1];
    }
    assert.ok(method, `${engine}: native save capability declarations`);
    const listing = method.includes("kSupportsListSaves") || method.includes("checkExtendedSaves");
    const loading = method.includes("kSupportsLoadingDuringStartup");
    // The catalog ships Grim demos, and the native engine lists no saves for
    // demos. Retail Grim also uses filename patterns outside the save bridge.
    assert.equal(supportsContinue(engine, engine === "mohawk" ? "myst" : "normal"),
      listing && loading && engine !== "grim", engine);
  }
});

test("completed output publishes immediately without a timer or close-tab handler", async () => {
  const f = shell({ resume: true }); await f.start(); f.scan([]);
  f.Module._scummweb_refresh_saves = () => f.scan([[1, "SKY-VM.001"]]);
  assert.equal(f.scope.__scummwebBeginSaveWrite("SKY-VM.001"), true);
  f.put("SKY-VM.001", "player", 200);
  f.poll();
  assert.equal(f.scope.__scummwebSaveStatus.latestSlot, null, "an open stream is not a save");
  if (f.scope.__scummwebEndSaveWrite("SKY-VM.001", true)) f.Module._scummweb_refresh_saves();
  const stored = JSON.parse(f.storage.get(saveIndexKey("", "sky")));
  assert.equal(latestPlayerSave(stored, stored.saves).slot, 1);
  assert.deepEqual(stored.pending, []);
  assert.equal(f.messages.at(-1).persisted, true);
});

test("interrupted same-size/time overwrites stay excluded after a new document opens", async () => {
  const f = shell({ resume: true }); await f.start();
  f.put("SKY-VM.001", "player", 200); f.scan([[1, "SKY-VM.001"]]);
  assert.equal(f.scope.__scummwebBeginSaveWrite("SKY-VM.001"), true);
  const reopened = shell({ resume: true, storage: f.storage });
  reopened.put("SKY-VM.001", "broken", 200); await reopened.start();
  assert.equal(reopened.scan([[1, "SKY-VM.001"]]), -1);
  assert.equal(reopened.scope.__scummwebBeginSaveWrite("SKY-VM.001"), true);
  reopened.put("SKY-VM.001", "repaired player save", 300);
  assert.equal(reopened.scope.__scummwebEndSaveWrite("SKY-VM.001", true), true);
  assert.equal(reopened.scan([[1, "SKY-VM.001"]]), 1);
});

test("write/finalization and BrowserFS close failures never become Continue", async () => {
  for (const failure of ["write", "close"]) {
    const f = shell({ resume: true }); await f.start(); f.scan([]);
    f.scope.__scummwebBeginSaveWrite("SKY-VM.001");
    f.put("SKY-VM.001", "valid-looking truncated header", 200);
    if (failure === "close") f.scope.__scummwebSaveIoFailed("/home/web_user/.local/share/scummvm/saves/SKY-VM.001");
    f.scope.__scummwebEndSaveWrite("SKY-VM.001", failure !== "write");
    assert.equal(f.scan([[1, "SKY-VM.001"]]), -1);
    assert.deepEqual(JSON.parse(f.storage.get(saveIndexKey("", "sky"))).pending, ["SKY-VM.001"]);
  }
});

test("pending-marker failures refuse overwrites and completed-index failures retry", async () => {
  const f = shell({ resume: true }); await f.start();
  f.put("SKY-VM.001", "player", 200); f.scan([[1, "SKY-VM.001"]]);
  const setItem = f.scope.localStorage.setItem;
  f.scope.localStorage.setItem = () => { throw new Error("quota"); };
  assert.equal(f.scope.__scummwebBeginSaveWrite("SKY-VM.001"), false);
  f.scope.localStorage.setItem = setItem;
  assert.equal(f.scope.__scummwebBeginSaveWrite("SKY-VM.001"), true);
  f.put("SKY-VM.001", "new player save", 300);
  f.scope.__scummwebEndSaveWrite("SKY-VM.001", true);
  f.scope.localStorage.setItem = () => { throw new Error("quota"); };
  f.scan([[1, "SKY-VM.001"]]);
  assert.equal(f.messages.at(-1).persisted, false);
  assert.deepEqual(JSON.parse(f.storage.get(saveIndexKey("", "sky"))).pending, ["SKY-VM.001"]);
  f.scope.localStorage.setItem = setItem;
  f.Module._scummweb_refresh_saves = () => f.scan([[1, "SKY-VM.001"]]);
  f.poll();
  assert.equal(f.messages.at(-1).persisted, true);
  assert.deepEqual(JSON.parse(f.storage.get(saveIndexKey("", "sky"))).pending, []);
});

test("restoring identical checkpoint bytes with a new time never creates player progress", async () => {
  const f = shell({ seed: true, resume: true }); await f.start();
  f.scope.__scummwebBeginSaveWrite("SKY-VM.000");
  f.put("SKY-VM.000", "player", 200);
  f.scope.__scummwebEndSaveWrite("SKY-VM.000", true);
  assert.equal(f.scan([[0, "SKY-VM.000"]]), 0);
  f.put("SKY-VM.000", "checkpoint", 300);
  assert.equal(f.scan([[0, "SKY-VM.000"]]), -1);
});

test("multiple open outputs defer refresh until all close; deletion clears pending state", async () => {
  const f = shell(); await f.start(); f.scan([]);
  f.scope.__scummwebBeginSaveWrite("SKY-VM.001");
  f.scope.__scummwebBeginSaveWrite("SKY-VM.SAV");
  assert.equal(f.scope.__scummwebEndSaveWrite("SKY-VM.001", true), false);
  assert.equal(f.scope.__scummwebEndSaveWrite("SKY-VM.SAV", false), true);
  assert.equal(f.scope.__scummwebSaveDeleted("SKY-VM.SAV"), true);
  f.scan([]);
  assert.deepEqual(JSON.parse(f.storage.get(saveIndexKey("", "sky"))).pending, []);
});
