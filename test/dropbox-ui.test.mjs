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
async function component(path, imports, react) {
  const url = new URL(path, import.meta.url);
  const { code } = await swc.transform(await readFile(url, "utf8"), { filename: url.pathname, swcrc: false, configFile: false,
    module: { type: "commonjs" }, jsc: { parser: { syntax: "ecmascript", jsx: true }, transform: { react: { runtime: "automatic" } } } });
  const compiled = { exports: {} };
  runInNewContext(code, { module: compiled, exports: compiled.exports,
    window: imports.window, localStorage: imports.window?.localStorage, Event,
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
  test(`${phase} sync warning follows the Dropbox URL flag without stopping background sync`, async () => {
    let query = "", state = null, starts = 0, stops = 0, unsubscribes = 0;
    const effects = [], listeners = new Map();
    const Preview = await component("../app/home-shell/dropbox-preview.js", {
      "next/navigation": { useSearchParams: () => new URLSearchParams(query) },
    }, { Suspense: nativeRequire("react").Suspense });
    const Sync = await component("../app/dropbox-save-sync.js", {
      "./home-shell/dropbox-preview": Preview,
      "./dropbox/bridge.mjs": { dropboxEnabled: () => true },
      "./dropbox/runtime.mjs": {
        getDropboxState: () => ({ phase }),
        subscribeDropbox: () => () => { unsubscribes++; },
        startDropboxSync: () => { starts++; return () => { stops++; }; },
      },
      window: { addEventListener: (name, callback) => listeners.set(name, callback),
        removeEventListener: (name) => listeners.delete(name) },
    }, { useState: () => [state, (next) => { state = next; }], useEffect: (effect) => effects.push(effect) });
    const render = () => renderToStaticMarkup(Sync());
    assert.doesNotMatch(render(), /role="status"/);
    const cleanup = effects[0]();
    await new Promise(setImmediate);
    assert.equal(starts, 1, "a connected account still synchronizes without the preview flag");
    for (query of ["", "other=true", "dropbox=false", "dropbox=1"]) {
      assert.doesNotMatch(render(), /dropbox-sync-warning|role="status"/);
    }
    query = "other=true&dropbox=true";
    assert.match(render(), /class="dropbox-sync-warning" role="status"/);
    assert.match(render(), phase === "waiting" ? /waiting to sync/ : /Reconnect Dropbox/);
    query = "";
    assert.doesNotMatch(render(), /dropbox-sync-warning|role="status"/);
    assert.equal(stops, 0, "hiding the warning does not stop synchronization");
    cleanup();
    assert.equal(stops, 1);
    assert.equal(unsubscribes, 1);
    assert.equal(listeners.size, 0);
  });
}

async function row(state, initialNotice = "") {
  let syncCalls = 0, reviews = 0, cursor = 0;
  const Icon = () => null;
  const Row = await component("../app/home-shell/dropbox-row.js", {
    "lucide-react": { Check: Icon, LoaderCircle: Icon, Unplug: Icon },
    "../dropbox/runtime.mjs": { getDropboxState: () => state, subscribeDropbox() {}, dropboxConfigured: () => true,
      async syncDropbox() { syncCalls++; }, async connectDropbox() {}, async disconnectDropbox() {} },
    "../cloud/transfer-progress.mjs": transfers,
    window: { dispatchEvent(event) { if (event.type === "scummweb:dropbox-review") reviews++; } },
  }, { useSyncExternalStore: () => state, useEffect() {}, useState() { return [cursor++ === 0 ? false : initialNotice, () => {}]; } });
  return { tree: Row(), calls: () => ({ syncCalls, reviews }) };
}

test("verified routine checks keep connected text and no transfer activity", async () => {
  const { tree } = await row({ phase: "connected", checking: true, verified: true, message: "" });
  assert.match(text(tree), /Dropbox connected/);
  assert.equal(text(tree).includes("Syncing"), false);
  assert.equal(nodes(tree).some(({ props }) => props?.className === "dropbox-spinner"), false);
  assert.equal(nodes(tree).some(({ props }) => props?.className === "dropbox-progress"), false);
  assert.equal(nodes(tree).some(({ props }) => props?.["aria-label"] === "Saves synced"), true);
  const firstCheck = await row({ phase: "connected", checking: true, verified: false, message: "" });
  assert.equal(nodes(firstCheck.tree).some(({ props }) => props?.["aria-label"] === "Saves synced"), false);
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
  const { tree } = await row({ phase: "syncing", transferProgress: { stage: "download", direction: "download", percentage: null } });
  assert.equal(nodes(tree).some(({ props }) => props?.className === "dropbox-percentage"), false);
  assert.match(text(tree), /Identifying game… · Downloading/);
});

async function settingsFixture({ needsGame = false, markMerged = false } = {}) {
  const destination = { key: "catalog:sky", title: "Beneath a Steel Sky", family: "sky" };
  const active = { destination, hash: "current", files: [{}] };
  const copies = ["older", "oldest"].map((hash, index) => ({ destination, hash, files: [{}], id: hash, preservedAt: 1700000000000 - index * 1000 }));
  const data = { sets: [active], stored: copies, destinations: [destination], revision: "current-revision",
    matches: new Map(copies.map(set => [set, destination.key])), unmatched: new Set() };
  let cursor = 0, refCursor = 0, writes = 0;
  const refs = [];
  const state = ["saves", "", "", data, null, null, "idle", false, "", false];
  const imported = { destination, hash: "imported", files: [{ path: "custom.001" }] };
  const imports = [];
  const calls = [], merges = [];
  let currentActive = active, currentRevision = "fresh-revision";
  const backups = { matchDestination: () => destination.key, getSaveDestinations: async () => [destination],
    getActiveSaveSets: async () => ({ sets: [currentActive], revision: currentRevision }), readStoredSets: async () => copies,
    withSaveLock: run => run(), applyImport: async options => { writes++; calls.push(options); } };
  const View = await component("../app/home-shell/settings-content.js", {
    "lucide-react": Object.fromEntries(["ArrowDownUp", "ArrowLeft", "Check", "ChevronDown", "Download", "Info", "Save", "Upload"].map(name => [name, () => null])),
    "../styles/settings-details.css": {}, "../game-sources.mjs": { readGameSources: async () => [] },
    "./dropbox-row": { default: () => null }, "./dropbox-preview": { default: () => null },
    "../save-backups/backups.mjs": backups, "../save-backups/filesystem.mjs": { captureFilesystem: () => ({ root: { key: "existing" } }) },
    "../dropbox/save-merge.mjs": { preferredSaveMerge: async (sets) => { merges.push(sets); return { set: markMerged ? { ...sets[0], hash: "merged-for-review" } : sets[0] }; } },
    "../save-backups/scummvm-transfer.mjs": { readSaveImport: async (files, destinations, game) => {
      imports.push({ files, destinations, game });
      if (needsGame && !game) throw Object.assign(new Error("Choose the matching game."), { kind: "choose-game" });
      return [imported];
    } },
    window: Object.assign(new EventTarget(), { localStorage: {} }),
  }, { useEffect() {}, useRef() { return refs[refCursor++] ||= { current: null }; }, useState(initial) {
    const index = cursor++; if (!(index in state)) state[index] = initial;
    return [state[index], value => { state[index] = typeof value === "function" ? value(state[index]) : value; }];
  } });
  const props = { catalog: [], officialUrl: "https://example.test", working: { current: false }, busy: false, setBusy() {} };
  return { calls, copies, imports, merges, setCurrent(set) { currentActive = set; currentRevision = "newer-revision"; }, writes: () => writes, render() { cursor = 0; refCursor = 0; return View(props); } };
}

test("the normal panel hides routine saves; recovery groups backups and leaves progress untouched", async () => {
  const fixture = await settingsFixture(); let tree = fixture.render();
  assert.equal(text(tree).includes("Beneath a Steel Sky"), false);
  assert.equal(text(tree).includes("Only active"), false);
  assert.equal(text(tree).includes("Game files are not included"), false);
  assert.ok(button(tree, "Recover saved progress"));
  button(tree, "Recover saved progress").props.onClick(); tree = fixture.render();
  assert.equal(nodes(tree).filter(node => node.type === "details").length, 1);
  assert.match(text(tree), /Beneath a Steel Sky2 backups/);
  assert.equal(nodes(tree).filter(node => node.type === "button" && text(node) === "Restore this copy…").length, 2);
  assert.equal(text(tree).includes(" · Active"), false);
  assert.equal(text(tree).includes("Preserved"), false);
  assert.equal(fixture.writes(), 0);
  button(tree, "Back to saved games").props.onClick();
  assert.ok(button(fixture.render(), "Recover saved progress")); assert.equal(fixture.writes(), 0);
});

test("recovery reviews a selected copy before restoring and keeps the safe import path", async () => {
  const fixture = await settingsFixture();
  fixture.copies[0].recovery = true;
  button(fixture.render(), "Recover saved progress").props.onClick();
  await button(fixture.render(), "Restore this copy…").props.onClick();
  let tree = fixture.render();
  assert.match(text(tree), /Restore saved progress/);
  assert.equal(fixture.writes(), 0, "opening the review must not restore anything");
  button(tree, "Cancel").props.onClick();
  assert.equal(fixture.writes(), 0);
  await button(fixture.render(), "Restore this copy…").props.onClick();
  await button(fixture.render(), "Restore this copy").props.onClick();
  assert.equal(fixture.writes(), 1);
  assert.equal(fixture.calls[0].rows[0].set, fixture.copies[0]);
  assert.equal(fixture.calls[0].rows[0].choice, "imported");
  assert.equal(fixture.calls[0].revision, "fresh-revision");
  tree = fixture.render(); assert.ok(button(tree, "Recover saved progress"));
  assert.equal(text(tree).includes("Saved progress restored."), true);
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
