import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import { BlobWriter, Uint8ArrayReader, ZipWriter } from "@zip.js/zip.js";
import { importLibraryRoots } from "../app/home-shell/game-import-controller.mjs";
import { fileNode, handleNode, prepareLocalArchive } from "../app/local-game-import.mjs";
import { gameIso } from "./helpers/game-iso.mjs";
import { withGameTelemetry } from "../app/game-player/telemetry.mjs";

const source = await readFile(new URL("../app/home-shell/source-library.js", import.meta.url), "utf8");
const runSource = source.slice(source.indexOf("  async function run("), source.indexOf("  function removeLibraryVersions("));
const startSource = source.slice(source.indexOf("  function importRoots("), source.indexOf("  function confirmImport("))
  .replace('import("./game-import-controller.mjs")', "loadController()");

function bridge(loadController) {
  const state = { busy: false, result: null };
  const context = {
    loadController, loading: false, working: { current: false },
    setBusy: value => { state.busy = value; }, setNotice() {}, showNotice() {},
    catalog: [], entries: [], sourcePresentation: null,
    sessionGames: new Map(), sessionSources: new Map(),
    loadSourcePresentation() {}, setSourcePresentation() {}, updateEntries() {}, setPending() {},
    setImportResult: value => { state.result = value; },
  };
  const start = runInNewContext(`${runSource}\n${startSource}\nimportRoots;`, context);
  return { start, state };
}

test("cold processing load retains picker activation and captured handle identity", async () => {
  let gesture = true, resolveController, loads = 0, processed;
  const handles = [{ name: "fixture.zip", kind: "file" }];
  const f = bridge(() => { loads++; return new Promise(resolve => { resolveController = resolve; }); });
  let pickerCalls = 0;
  const pending = f.start(() => { pickerCalls++; assert.equal(gesture, true); return Promise.resolve(handles); });
  gesture = false;
  assert.equal(pickerCalls, 1);
  assert.equal(f.state.busy, true);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(loads, 1);
  resolveController({ importLibraryRoots: roots => { processed = roots; } });
  await pending;
  assert.equal(processed, handles);
  assert.equal(f.state.busy, false);
});

test("empty selection and picker cancellation do not request processing code", async () => {
  const f = bridge(() => assert.fail("No controller should load"));
  await f.start(() => []);
  await f.start(() => { const error = new Error("Cancelled"); error.name = "AbortError"; throw error; });
  assert.equal(f.state.result, null);
  assert.equal(f.state.busy, false);
});

test("failed controller load restores controls and can be retried without losing files", async () => {
  let fail = true, processed;
  const f = bridge(async () => {
    if (fail) throw new Error("Synthetic chunk failure");
    return { importLibraryRoots: roots => { processed = roots; } };
  });
  const roots = [{ name: "fixture.zip" }];
  await f.start(roots);
  assert.equal(f.state.result.items[0].message, "Synthetic chunk failure");
  assert.equal(f.state.busy, false);
  fail = false;
  await f.start(roots);
  assert.equal(processed, roots);
});

test("imported play preserves explicit isolation and telemetry through client navigation", async () => {
  const playSource = source.slice(source.indexOf("  function play(source, game,"), source.indexOf("  async function allowAccess("));
  for (const [current, resume, expected] of [
    ["https://example.test/game?telemetry=1&agentSaveScope=scope", false, "/game/play?telemetry=1&agentSaveScope=scope"],
    ["https://example.test/game?telemetry=1&agentSaveScope=scope", true, "/game/play?telemetry=1&agentSaveScope=scope#continue"],
    ["https://example.test/game", true, "/game/play#continue"],
  ]) {
    const navigations = [];
    const context = {
      isLocalArchiveSource: () => true, run: callback => callback(),
      sourcePresentation: { prepareGameSourcePlayer: async (_source, game) => ({ game, loadArchive() {} }),
        getGamePlayHref: () => "/game/play" },
      sourceActivityVersion: () => "fixture", selectGameArchive() {}, rememberGameVersion() {},
      getGameFamilyKey: () => "fixture", onPlayArchive: undefined,
      router: { push: href => navigations.push(href) }, window: { location: { href: current } },
      withGameTelemetry, exitImmersiveMode() {},
    };
    const play = runInNewContext(`${playSource}\nplay;`, context);
    assert.equal(await play({ id: "fixture", url: "https://example.test/game.zip" }, {}, resume), true);
    assert.deepEqual(navigations, [expected]);
  }
});

test("imported selection preserves scope and telemetry without changing route matching", () => {
  const selectSource = source.slice(source.indexOf("  function selectGame(game)"), source.indexOf("\n  return (", source.indexOf("  function selectGame(game)")));
  for (const [current, expected] of [
    ["https://example.test/?telemetry=1&agentSaveScope=scope", "/game?telemetry=1&agentSaveScope=scope"],
    ["https://example.test/", "/game"],
  ]) {
    const history = [];
    const context = {
      playerRoute: false, buildGameExitHref: game => game.href,
      groups: [{ game: { href: "/game" }, key: "fixture" }],
      window: { location: new URL(current), history: { pushState: (_state, _title, href) => history.push(href) } },
      withGameTelemetry, setSelection() {}, setNavigationId() {},
    };
    const select = runInNewContext(`${selectSource}\nselectGame;`, context);
    assert.equal(select({ href: "/game" }), true);
    assert.deepEqual(history, [expected]);
  }
});

async function zip() {
  const writer = new ZipWriter(new BlobWriter());
  await writer.add("game/vol.cat", new Uint8ArrayReader(Uint8Array.of(1, 2)));
  return new File([await writer.close()], "fixture.zip");
}

function processing(entries = []) {
  const state = { entries: [...entries], result: null, pending: [] };
  const context = {
    catalog: [], entries, sourcePresentation: { artwork: {} },
    sessionGames: new Map(), sessionSources: new Map(),
    loadSourcePresentation: () => assert.fail("Artwork is already available"),
    setSourcePresentation() {},
    updateEntries(sources) {
      const ids = new Set(sources.map(source => source.id));
      state.entries = [...state.entries.filter(({ source }) => !ids.has(source.id)),
        ...sources.map(source => ({ source, status: "session" }))];
    },
    setPending(value) { state.pending = typeof value === "function" ? value(state.pending) : value; },
    setImportResult(value) { state.result = value; },
  };
  return { context, state };
}

test("mixed ZIP, ISO and invalid input preserve readable siblings and in-memory fallback", async () => {
  const f = processing();
  const roots = [fileNode(await zip()), fileNode(new File([await gameIso()], "fixture.iso")),
    fileNode(new File(["not an archive"], "invalid.zip"))];
  await importLibraryRoots(roots, null, f.context);
  assert.equal(f.state.result.items.filter(item => item.status === "added").length, 2);
  assert.equal(f.state.result.items.filter(item => item.status === "error").length, 1);
  assert.equal(f.state.result.temporary, 2);
  assert.equal(f.context.sessionGames.size, 2);
  assert.equal(f.context.sessionSources.size, 2);
  assert.equal(f.state.pending.length, 0);
});

test("duplicate archives retain a single source and do not double-count temporary games", async () => {
  const f = processing(), file = await zip();
  await importLibraryRoots([fileNode(file), fileNode(file)], null, f.context);
  assert.equal(f.state.result.savedIds.size, 1);
  assert.equal(f.state.result.temporary, 1);
  assert.equal(f.state.result.items[1].status, "skipped");
  assert.equal(f.state.entries.length, 1);
});

test("storage failure never replaces an existing persistent source with a temporary one", async () => {
  const file = await zip(), game = await prepareLocalArchive(fileNode(file));
  const existing = { id: "persistent", name: file.name, fingerprint: game.fingerprint };
  const f = processing([{ source: existing, status: "locate" }]);
  await importLibraryRoots([fileNode(file)], existing, f.context);
  assert.equal(f.state.result.items[0].status, "error");
  assert.equal(f.state.entries[0].source, existing);
  assert.equal(f.context.sessionSources.size, 0);
});

test("folder imports give each dropped root its own group even when the names match", async () => {
  const file = await zip();
  const iso = new File([await gameIso()], "fixture.iso");
  const folder = (files) => handleNode({ kind: "directory", name: "Games", async *values() {
    for (const file of files) yield { kind: "file", name: file.name, getFile: async () => file };
  } });
  const f = processing();
  await importLibraryRoots([folder([file]), folder([iso])], null, f.context);
  const [first, second] = f.state.entries.map(({ source }) => source.archiveFolderId);
  assert.ok(first);
  assert.ok(second);
  assert.notEqual(first, second);
});

test("locating the same file keeps its folder group and a moved replacement clears it", async () => {
  const file = await zip();
  const game = await prepareLocalArchive(fileNode(file));
  const handle = { kind: "file", name: file.name, getFile: async () => file };
  for (const sameEntry of [true, false]) {
    const existing = { id: "saved", name: file.name, handle, fingerprint: game.fingerprint,
      archiveFolderId: "previous-folder" };
    const f = processing([{ source: existing, status: "missing" }]);
    f.context.sessionSources.set(existing.id, existing);
    const selected = handleNode({ ...handle, isSameEntry: async () => sameEntry });
    await importLibraryRoots([selected], existing, f.context);
    assert.equal(f.state.entries[0].source.id, existing.id);
    assert.equal(f.state.entries[0].source.archiveFolderId, sameEntry ? "previous-folder" : undefined);
  }
});
