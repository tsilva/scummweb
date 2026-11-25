import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import test from "node:test";
import swc from "next/dist/build/swc/index.js";
import { connectionKey } from "../app/dropbox/client.mjs";
import * as transfers from "../app/cloud/transfer-progress.mjs";
import { renderToStaticMarkup } from "react-dom/server";

const nativeRequire = createRequire(import.meta.url);
await swc.loadBindings();
async function component(path, imports, react, browserGlobals = {}) {
  const url = new URL(path, import.meta.url);
  const { code } = await swc.transform(await readFile(url, "utf8"), { filename: url.pathname, swcrc: false, configFile: false,
    module: { type: "commonjs" }, jsc: { parser: { syntax: "ecmascript", jsx: true }, transform: { react: { runtime: "automatic" } } } });
  const compiled = { exports: {} };
  runInNewContext(code, { module: compiled, exports: compiled.exports,
    window: imports.window, localStorage: imports.window?.localStorage, navigator: imports.navigator, Event,
    ...browserGlobals,
    require: (name) => name === "react" ? react : name === "react/jsx-runtime" ? nativeRequire(name) : imports[name] });
  return compiled.exports.default;
}
function nodes(root) {
  if (!root || typeof root !== "object") return [];
  return [root, ...[root.props?.children].flat(Infinity).flatMap(nodes)];
}
const text = (node) => typeof node === "string" || typeof node === "number" ? String(node)
  : !node || typeof node !== "object" ? "" : [node.props?.children].flat(Infinity).map(text).join("");
const button = (root, name) => nodes(root).find((node) => node.type === "button" && text(node) === name);

for (const phase of ["waiting", "reconnect"]) {
  test(`${phase} sync coordinator starts after a Dropbox connection on a plain URL`, async () => {
    let connected = false, state = null, starts = 0, stops = 0, unsubscribes = 0;
    const effects = [], listeners = new Map();
    const Sync = await component("../app/dropbox-save-sync.js", {
      "./dropbox/bridge.mjs": { dropboxEnabled: () => connected },
      "./dropbox/runtime.mjs": {
        getDropboxState: () => ({ phase }),
        subscribeDropbox: () => () => { unsubscribes++; },
        startDropboxSync: () => { starts++; return () => { stops++; }; },
      },
      window: { location: new URL("https://example.test/"), addEventListener: (name, callback) => listeners.set(name, callback),
        removeEventListener: (name) => listeners.delete(name) },
    }, { useState: () => [state, (next) => { state = next; }], useEffect: (effect) => effects.push(effect) });
    const render = () => renderToStaticMarkup(Sync());
    assert.doesNotMatch(render(), /role="status"/);
    const cleanup = effects[0]();
    assert.equal(starts, 0);
    connected = true;
    listeners.get("scummweb:dropbox-connection")();
    await new Promise(setImmediate);
    assert.equal(starts, 1);
    assert.match(render(), /class="dropbox-sync-warning" role="status"/);
    assert.match(render(), phase === "waiting" ? /waiting to sync/ : /Reconnect Dropbox/);
    cleanup();
    assert.equal(stops, 1);
    assert.equal(unsubscribes, 1);
    assert.equal(listeners.size, 0);
  });
}

async function row(state, { online = true, configured = true } = {}) {
  const calls = [];
  const Icon = () => null;
  const Row = await component("../app/home-shell/dropbox-row.js", {
    "lucide-react": { Check: Icon, LoaderCircle: Icon },
    "../dropbox/runtime.mjs": { getDropboxState: () => state, subscribeDropbox() {}, dropboxConfigured: () => configured,
      async connectDropbox() { calls.push("connect"); }, async disconnectDropbox() { calls.push("disconnect"); } },
    "../cloud/transfer-progress.mjs": transfers,
    navigator: { onLine: online },
  }, { useSyncExternalStore: (_subscribe, getSnapshot) => getSnapshot(), useEffect() {}, useState: initial => [initial, () => {}] });
  return { tree: Row(), calls };
}

test("verified routine checks show an up-to-date status and only the disconnect action", async () => {
  const { tree, calls } = await row({ phase: "connected", checking: true, verified: true, message: "" });
  const status = nodes(tree).find(({ props }) => props?.role === "status");
  assert.equal(text(status), "Saves up to date");
  assert.equal(nodes(status).some(({ type }) => type === "button"), false);
  assert.equal(text(tree).includes("Syncing"), false);
  assert.equal(nodes(tree).some(({ props }) => props?.className === "dropbox-spinner"), false);
  assert.equal(nodes(tree).some(({ props }) => props?.className === "dropbox-progress"), false);
  const actions = nodes(tree).filter(({ type }) => type === "button");
  assert.deepEqual(actions.map(text), ["Disconnect"]);
  assert.equal(actions[0].props.className, "secondary-button");
  await actions[0].props.onClick();
  assert.deepEqual(calls, ["disconnect"]);
  const firstCheck = await row({ phase: "connected", checking: true, verified: false, message: "" });
  assert.match(text(firstCheck.tree), /Checking saves/);
  assert.doesNotMatch(text(firstCheck.tree), /Saves up to date/);
});

test("connect is the only disconnected action and opens Dropbox authorization", async () => {
  const { tree, calls } = await row({ phase: "disconnected" });
  assert.match(text(tree), /Saves are stored on this device/);
  assert.deepEqual(nodes(tree).filter(({ type }) => type === "button").map(text), ["Connect"]);
  await button(tree, "Connect").props.onClick();
  assert.deepEqual(calls, ["connect"]);
  const unavailable = await row({ phase: "disconnected" }, { configured: false });
  assert.equal(button(unavailable.tree, "Connect").props.disabled, true);
  assert.match(text(unavailable.tree), /Dropbox sync is unavailable/);
});

test("offline saves supersede up-to-date and in-progress cloud statuses", async () => {
  for (const state of [{ phase: "connected", verified: true }, { phase: "syncing", transferProgress: { stage: "upload", direction: "upload", percentage: 42, title: "Beneath a Steel Sky" } }, { phase: "waiting" }]) {
    const { tree } = await row(state, { online: false });
    assert.match(text(tree), /Offline · Saves stay on this device/);
    assert.match(text(tree), /Sync resumes automatically/);
    assert.doesNotMatch(text(tree), /Saves up to date|Syncing saves|42%/);
    assert.deepEqual(nodes(tree).filter(({ type }) => type === "button").map(text), ["Disconnect"]);
  }
  const { tree } = await row({ phase: "waiting", message: "Could not sync saves. Your local copies are retained." });
  assert.match(text(tree), /Saves waiting to sync/);
  assert.match(text(tree), /Your local copies are retained/);
  assert.deepEqual(nodes(tree).filter(({ type }) => type === "button").map(text), ["Disconnect"]);
});

test("expired authorization offers reconnect and keeps that status visible offline", async () => {
  const { tree, calls } = await row({ phase: "reconnect" });
  assert.match(text(tree), /Dropbox needs to be reconnected/);
  await button(tree, "Reconnect Dropbox").props.onClick();
  assert.deepEqual(calls, ["connect"]);
  const offline = await row({ phase: "reconnect" }, { online: false });
  assert.match(text(offline.tree), /Dropbox needs to be reconnected/);
  assert.match(text(offline.tree), /Go online to reconnect Dropbox/);
  assert.equal(button(offline.tree, "Reconnect Dropbox").props.disabled, true);
});

for (const [stage, direction, expected] of [
  ["upload", "upload", "42% · Beneath a Steel Sky · Uploading"],
  ["download", "download", "42% · Beneath a Steel Sky · Downloading"],
  ["verify", "upload", "42% · Beneath a Steel Sky · Verifying"],
  ["restore", null, "42% · Beneath a Steel Sky · Restoring"],
]) test(`syncing exposes ${stage}/${direction} activity in its status line`, async () => {
  const { tree } = await row({ phase: "syncing", message: "obsolete", transferProgress: { stage, direction, percentage: 42, title: "Beneath a Steel Sky" } });
  assert.equal(text(nodes(tree).find(({ props }) => props?.className === "dropbox-progress")), expected);
  assert.equal(text(nodes(tree).find(({ props }) => props?.className === "dropbox-percentage")), "42%");
  assert.equal(nodes(tree).some(({ props }) => props?.className === "dropbox-notice"), false);
});

test("an unknown transfer total shows no fabricated percentage", async () => {
  const { tree } = await row({ phase: "syncing", transferProgress: { stage: "download", direction: "download", percentage: null, title: "Beneath a Steel Sky" } });
  assert.equal(nodes(tree).some(({ props }) => props?.className === "dropbox-percentage"), false);
  assert.match(text(tree), /Beneath a Steel Sky · Downloading/);
});

test("syncing before the first named game has no placeholder row", async () => {
  const { tree } = await row({ phase: "syncing", transferProgress: null });
  assert.match(text(tree), /Syncing saves/);
  assert.equal(nodes(tree).some(({ props }) => props?.className === "dropbox-progress"), false);
});

async function settingsFixture({ needsGame = false, markMerged = false, readSources, browserGlobals = {} } = {}) {
  const destination = { key: "catalog:sky", title: "Beneath a Steel Sky", family: "sky" };
  const active = { destination, hash: "current", files: [{}] };
  const copies = ["older", "oldest"].map((hash, index) => ({ destination, hash, files: [{}], id: hash, preservedAt: 1700000000000 - index * 1000 }));
  const data = { sets: [active], stored: copies, destinations: [destination], revision: "current-revision" };
  let cursor = 0, refCursor = 0, writes = 0;
  const refs = [];
  const state = ["saves", "", "", readSources ? null : data, null, false, "", false];
  const effects = [];
  const imported = { destination, hash: "imported", files: [{ path: "custom.001" }] };
  const imports = [];
  const calls = [], merges = [];
  let currentActive = active, currentRevision = "fresh-revision";
  const backups = { matchDestination: () => destination.key, getSaveDestinations: async () => [destination],
    getActiveSaveSets: async () => ({ sets: [currentActive], revision: currentRevision, hasRoot: true }), readStoredSets: async () => copies,
    withSaveLock: run => run(), applyImport: async options => { writes++; calls.push(options); } };
  const View = await component("../app/home-shell/settings-content.js", {
    "lucide-react": Object.fromEntries(["ArrowDownUp", "Check", "ChevronDown", "Download", "Info", "Save", "Shield", "Upload"].map(name => [name, () => null])),
    "../../lib/privacy-consent/controls": { PrivacySettingsSwitches: () => null },
    "../styles/settings-details.css": {}, "../game-sources.mjs": { readGameSources: readSources || (async () => []) },
    "./dropbox-row": { __esModule: true, default: "dropbox-row" },
    "../save-backups/backups.mjs": backups, "../../web-shell/save-storage.mjs": { openSaveStorage: async () => ({}) },
    "../dropbox/save-merge.mjs": { preferredSaveMerge: async (sets) => { merges.push(sets); return { set: markMerged ? { ...sets[0], hash: "merged-for-review" } : sets[0] }; } },
    "../save-backups/scummvm-transfer.mjs": { exportScummvmSaves: async () => new Blob(["export"]), readSaveImport: async (files, destinations, game) => {
      imports.push({ files, destinations, game });
      if (needsGame && !game) throw Object.assign(new Error("Choose the matching game."), { kind: "choose-game" });
      return [imported];
    } },
    window: Object.assign(new EventTarget(), { localStorage: {} }),
  }, { useEffect(effect, deps) { if (!deps.length) effects.push(effect); }, useRef() { return refs[refCursor++] ||= { current: null }; }, useState(initial) {
    const index = cursor++; if (!(index in state)) state[index] = initial;
    return [state[index], value => { state[index] = typeof value === "function" ? value(state[index]) : value; }];
  } }, browserGlobals);
  const props = { catalog: [], officialUrl: "https://example.test", working: { current: false }, busy: false,
    setBusy(busy) { props.busy = busy; }, loadingIndicator: "settings spinner" };
  return { calls, copies, effects, imports, merges, setCurrent(set) { currentActive = set; currentRevision = "newer-revision"; }, writes: () => writes, render() { cursor = 0; refCursor = 0; return View(props); } };
}

test("Saved games includes the Dropbox row without a preview wrapper", async () => {
  const fixture = await settingsFixture();
  assert.ok(nodes(fixture.render()).some(node => node.type === "dropbox-row"));
});

test("Settings keeps the spinner until the initial save read settles", async () => {
  for (const fail of [false, true]) {
    const sources = Promise.withResolvers();
    let reads = 0;
    const fixture = await settingsFixture({ readSources: () => { reads++; return sources.promise; } });
    assert.equal(fixture.render(), "settings spinner");
    fixture.effects[0]();
    fixture.effects[0]();
    assert.equal(reads, 1);
    assert.equal(fixture.render(), "settings spinner");
    if (fail) sources.reject(new Error("Could not read saves."));
    else sources.resolve([]);
    await new Promise(setImmediate);
    const tree = fixture.render();
    assert.equal(button(tree, "Saved games").props.disabled, undefined);
    assert.equal(button(tree, "About").props.disabled, undefined);
    if (fail) assert.match(text(tree), /Could not read saves/);
  }
});

test("export hands the ZIP to the browser without adding a second download link", async () => {
  const revoked = [];
  const timers = [];
  const link = { click: () => { link.clicked = true; }, remove: () => { link.removed = true; } };
  const fixture = await settingsFixture({ browserGlobals: {
    document: { body: { appendChild: (element) => assert.equal(element, link) },
      createElement: (tag) => { assert.equal(tag, "a"); return link; } },
    URL: { createObjectURL: () => "blob:export", revokeObjectURL: (url) => revoked.push(url) },
    setTimeout: (callback) => timers.push(callback),
  } });
  const download = button(fixture.render(), "Export saves").props.onClick();
  const transferring = fixture.render();
  assert.equal(button(transferring, "Saved games").props.disabled, undefined);
  assert.equal(button(transferring, "About").props.disabled, undefined);
  assert.equal(button(transferring, "Export saves").props.disabled, true);
  assert.doesNotMatch(text(transferring), /Exporting|Downloading|Working/);
  await download;
  assert.ok(link.clicked && link.removed);
  assert.match(link.download, /^scummweb-saves-\d{4}-\d{2}-\d{2}\.zip$/);
  const exported = fixture.render();
  assert.ok(button(exported, "Downloaded"));
  assert.ok(!nodes(exported).some(({ type, props }) => type === "a" && props?.download));
  assert.deepEqual(revoked, []);
  assert.equal(timers.length, 1);
  timers[0]();
  assert.deepEqual(revoked, ["blob:export"]);
});

test("Settings offers transfers while saved backups are handled in Load Game", async () => {
  const fixture = await settingsFixture();
  const tree = fixture.render();
  assert.match(text(tree), /Transfer saves to or from your ScummVM apps/);
  assert.ok(button(tree, "Export saves") && button(tree, "Import saves"));
  assert.doesNotMatch(text(tree), /Restore a backup|Choose a backup|Review backup/);
});

test("ordinary file selections reach import review without conflict choices and preserve the existing progress", async () => {
  const fixture = await settingsFixture();
  const input = nodes(fixture.render()).find(({ type }) => type === "input");
  assert.equal(input.props.multiple, true);
  assert.equal(input.props.accept, undefined, "native saves have engine-specific extensions");
  const files = [new File(["slot"], "SKY-VM.001"), new File(["index"], "SKY-VM.SAV")];
  await input.props.onChange({ target: { files, value: "selected" } });
  const tree = fixture.render();
  assert.equal(fixture.imports[0].files.length, 2);
  assert.ok(button(tree, "Import saves"));
  assert.equal(nodes(tree).filter(({ props }) => props?.type === "radio").length, 0);
  assert.match(text(tree), /current progress will be kept/);
  await button(tree, "Import saves").props.onClick();
  assert.equal(fixture.writes(), 1);
  assert.equal(fixture.calls[0].rows[0].choice, "imported");
});

test("choosing a game retries the same selected files without reopening a file picker", async () => {
  const fixture = await settingsFixture({ needsGame: true });
  const input = nodes(fixture.render()).find(({ type }) => type === "input");
  const file = new File(["progress"], "custom.001");
  await input.props.onChange({ target: { files: [file], value: "selected" } });
  const select = nodes(fixture.render()).find(({ type }) => type === "select");
  assert.ok(select);
  await select.props.onChange({ target: { value: "catalog:sky" } });
  assert.equal(fixture.imports.length, 2);
  assert.equal(fixture.imports[1].files[0], file);
  assert.equal(fixture.imports[1].game, "catalog:sky");
  assert.ok(button(fixture.render(), "Import saves"));
  assert.equal(nodes(fixture.render()).filter(({ type }) => type === "select").length, 0);
});


test("confirmation recomputes from original incoming files and fresh progress after background changes", async () => {
  const fixture = await settingsFixture({ markMerged: true });
  const input = nodes(fixture.render()).find(({ type }) => type === "input");
  await input.props.onChange({ target: { files: [new File(["slot"], "custom.001")], value: "selected" } });
  fixture.setCurrent({ destination: { key: "catalog:sky" }, hash: "newer-background-progress", files: [{ path: "new-slot.002" }] });
  await button(fixture.render(), "Import saves").props.onClick();
  assert.equal(fixture.writes(), 1);
  assert.equal(fixture.calls[0].revision, "newer-revision");
  assert.equal(fixture.merges.length, 2);
  assert.equal(fixture.merges[1][0].hash, "imported", "never replay a stale review union as incoming progress");
  assert.equal(fixture.merges[1][1].hash, "newer-background-progress");
});
