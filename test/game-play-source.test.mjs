import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import test from "node:test";
import swc from "next/dist/build/swc/index.js";
import library from "../scummvm-shell/games.json" with { type: "json" };
import { getBundledGameLibrary } from "../lib/catalog.mjs";
import { getRecognizedGames } from "../app/recognized-games.mjs";
import * as telemetry from "../app/game-player/telemetry.mjs";
import * as playSources from "../app/game-play-source.mjs";
import * as versions from "../app/game-versions.mjs";
import { checkGameSource } from "../app/game-sources.mjs";

const catalog = getBundledGameLibrary(library).games;
const recognizedGames = getRecognizedGames(catalog);
const tentacle = recognizedGames.find(({ slug }) => slug === "day-of-the-tentacle");
const sky = recognizedGames.find(({ target }) => target === "sky");
const imported = { id: "my-dott", name: "Day of the Tentacle (DOS) (English).zip" };

function source(permission = "granted") {
  return { ...imported, handle: {
    queryPermission: async () => permission,
    getFile: async () => new File(["data"], imported.name),
    requestPermission: () => assert.fail("Restoring a route must never request permission without a click"),
  } };
}

test("recognized imports, hosted copies and bundled games share canonical play URLs", () => {
  for (const game of recognizedGames) assert.equal(playSources.getGamePlayHref(game), `${game.href}/play`);
  const local = playSources.getSourceGamePresentation(imported, catalog, recognizedGames);
  const remote = playSources.getSourceGamePresentation({ ...imported, url: "https://example.test/dott.zip" }, catalog, recognizedGames);
  for (const game of [local, remote]) {
    assert.equal(game.playHref, tentacle.playHref);
    assert.equal(game.saveVersionId, imported.id);
  }
  assert.equal(playSources.getGamePlayHref(null), "/local/play");
  assert.equal(playSources.getGamePlayHref({ displayTitle: "Unidentified" }), "/local/play");
});

test("restored routes match game families and keep demos separate", () => {
  const demo = recognizedGames.find(({ slug }) => slug === "the-secret-of-monkey-island-demo");
  const full = recognizedGames.find(({ slug }) => slug === "the-secret-of-monkey-island");
  const sources = [imported, { id: "full", name: "The Secret of Monkey Island.zip" },
    { id: "demo", name: "The Secret of Monkey Island (Demo).zip" }, { id: "other", name: "Unknown.zip" }];
  assert.deepEqual(playSources.getMatchingGameSources(tentacle, sources, catalog).map(({ id }) => id), [imported.id]);
  assert.deepEqual(playSources.getMatchingGameSources(full, sources, catalog).map(({ id }) => id), ["full"]);
  assert.deepEqual(playSources.getMatchingGameSources(demo, sources, catalog).map(({ id }) => id), ["demo"]);
});

test("reopened copies retain their save namespace and legacy saves remain explicit", async () => {
  const game = playSources.getSourceGamePresentation(imported, catalog, recognizedGames);
  const first = await playSources.prepareGameSourcePlayer(source(), game);
  const refreshed = await playSources.prepareGameSourcePlayer(source(), game);
  assert.match(first.game.saveNamespace, /^version-[a-f0-9]{64}$/);
  assert.equal(refreshed.game.saveNamespace, first.game.saveNamespace);
  assert.equal(first.game.saveVersionId, imported.id);
  assert.equal(first.game.recentGameId, `source:${imported.id}`);
  assert.equal(first.game.platform, "DOS");
  assert.equal(first.game.language, "English");
  assert.equal(first.game.skipIntro, null);
  const legacy = await playSources.prepareGameSourcePlayer(source(), game, { legacySaves: true });
  assert.equal(legacy.game.saveNamespace, undefined);
  assert.equal(legacy.game.saveVersionId, undefined);
  await assert.rejects((await playSources.prepareGameSourcePlayer(source("prompt"), game))
    .loadArchive(new AbortController().signal), /Allow file access/);
});

await swc.loadBindings();
async function player({ game = tentacle, sources = [], remembered = null, pending = null, readError = false, delayRead = false, hash = "" } = {}) {
  const url = new URL("../app/game-play-frame.js", import.meta.url);
  const { code } = await swc.transform(await readFile(url, "utf8"), {
    filename: url.pathname, swcrc: false, configFile: false, module: { type: "commonjs" },
    jsc: { parser: { syntax: "ecmascript", jsx: true }, transform: { react: { runtime: "automatic" } } },
  });
  const module = { exports: {} }, states = [], effects = [];
  let cursor = 0, reads = 0;
  const settled = Promise.withResolvers(), sourceRead = Promise.withResolvers();
  const window = { location: new URL(`https://example.test${game.playHref}${hash}`),
    history: { replaceState(data, title, href) { window.location = new URL(href, window.location); } } };
  function Archive() {}
  function Remote() {}
  function Library() {}
  const loadPending = () => {};
  runInNewContext(code, { module, exports: module.exports, window, URLSearchParams, AbortController,
    require(name) {
      if (name === "react/jsx-runtime") return createRequire(url)(name);
      if (name === "react") return {
        useState(initial) {
          const index = cursor++;
          if (!(index in states)) states[index] = initial;
          return [states[index], (value) => { states[index] = value; settled.resolve(); }];
        }, useEffect: (effect) => effects.push(effect), useMemo: (fn) => fn(),
        useSyncExternalStore: (_subscribe, read) => read(),
      };
      if (name === "next/dynamic") return () => Library;
      if (name === "./archive-play-frame") return { ArchivePlayer: Archive, RemoteArchivePlayer: Remote };
      if (name === "./game-play-source.mjs") return playSources;
      if (name === "./game-player/telemetry.mjs") return telemetry;
      if (name === "./recognized-games.mjs") return { getRecognizedGames };
      if (name === "./game-versions.mjs") return { ...versions, readChosenVersion: () => remembered };
      if (name === "./game-sources.mjs") return { checkGameSource, readGameSources: async () => {
        reads++;
        if (delayRead) await sourceRead.promise;
        if (readError) throw new Error("Storage unavailable");
        return sources;
      } };
      if (name === "./local-game-archive.mjs") return {
        getSelectedGamePresentation: () => pending, openSelectedGameArchive: loadPending,
      };
      throw new Error(`Unexpected import ${name}`);
    },
  });
  function render() {
    cursor = 0;
    return module.exports.default({ game, catalog, recognizedGames, officialUrl: "https://example.test/games", children: "bundled" });
  }
  render();
  const cleanup = effects.shift()();
  if (!delayRead) await settled.promise;
  return { render, cleanup, releaseRead: sourceRead.resolve, Archive, Remote, Library, window, loadPending, reads: () => reads,
    changeHash(value) {
      window.location.hash = value;
      render();
      effects.at(-1)();
      return render();
    },
  };
}

test("refreshing an imported game restores the remembered accessible copy", async () => {
  const second = { ...source(), id: "dott-second-copy" };
  const app = await player({ sources: [source(), second], remembered: `source:${second.id}` });
  const view = app.render();
  assert.equal(view.type, app.Archive);
  assert.equal(view.props.game.saveVersionId, second.id);
  assert.equal(view.props.game.playHref, tentacle.playHref);
  app.cleanup();
});

test("missing, denied and unavailable library storage show the import and reconnect controls", async () => {
  for (const options of [{}, { sources: [source("prompt")] }, { readError: true }]) {
    const app = await player(options);
    const library = app.render().props.children.find((child) => child.type === app.Library);
    assert.equal(library.props.featuredGame, tentacle);
    assert.equal(library.props.playerRoute, true);
    const selectedGame = { ...tentacle, saveVersionId: imported.id, saveNamespace: "version-" + "a".repeat(64) };
    assert.equal(library.props.onPlayArchive(selectedGame, true), true);
    assert.equal(app.window.location.pathname, tentacle.playHref);
    assert.equal(app.window.location.hash, "#continue");
    assert.equal(app.render().props.game, selectedGame);
    assert.equal(library.props.onPlayArchive(sky, false), false);
    app.cleanup();
  }
});

test("bundled games and in-memory handoffs preserve explicit launch selection", async () => {
  const bundled = await player({ game: sky });
  assert.equal(bundled.render(), "bundled");
  assert.equal(bundled.reads(), 0);
  bundled.cleanup();
  const pending = { ...tentacle, saveVersionId: imported.id };
  const handoff = await player({ pending });
  assert.equal(handoff.render().props.game, pending);
  assert.equal(handoff.render().props.loadArchive, handoff.loadPending);
  assert.equal(handoff.reads(), 0);
  handoff.cleanup();
  const wrong = await player({ pending: sky });
  assert.notEqual(wrong.render().type, wrong.Archive, "a different game's handoff is never consumed");
  wrong.cleanup();
});

test("direct ZIP fragments take precedence over bundled defaults and resolve again when removed", async () => {
  const app = await player({ game: sky, hash: "#zip=https%3A%2F%2Fexample.test%2Fgame.zip" });
  assert.equal(app.render().type, app.Remote);
  assert.equal(app.render().props.zip, "https://example.test/game.zip");
  assert.equal(app.reads(), 0);
  assert.equal(app.changeHash(""), "bundled");
  app.cleanup();
  const handoff = await player({ game: sky, hash: "#zip=https%3A%2F%2Fexample.test%2Fgame.zip", pending: sky });
  assert.equal(handoff.render().type, handoff.Archive, "a prepared direct-link archive is reused after navigation");
  handoff.cleanup();
});

test("leaving a route cancels pending source restoration", async () => {
  const app = await player({ sources: [source()], delayRead: true });
  app.cleanup();
  app.releaseRead();
  await new Promise(setImmediate);
  assert.equal(app.render().type, "p", "an abandoned route stays unmounted while restoration finishes");
});

async function remotePlayer(pathname, identifiedGame, search = "") {
  const url = new URL("../app/archive-play-frame.js", import.meta.url);
  const { code } = await swc.transform(await readFile(url, "utf8"), {
    filename: url.pathname, swcrc: false, configFile: false, module: { type: "commonjs" },
    jsc: { parser: { syntax: "ecmascript", jsx: true }, transform: { react: { runtime: "automatic" } } },
  });
  const module = { exports: {} }, effects = [], states = [], redirects = [], selections = [];
  const hash = "#zip=https%3A%2F%2Fexample.test%2Fgame.zip";
  const loadArchive = () => {};
  let cursor = 0, preparations = 0;
  runInNewContext(code, { module, exports: module.exports, AbortController, window: { location: new URL(`https://example.test${pathname}${search}${hash}`) },
    require(name) {
      if (name === "react/jsx-runtime") return createRequire(url)(name);
      if (name === "react") return {
        useState(initial) {
          const index = cursor++;
          if (!(index in states)) states[index] = initial;
          return [states[index], (value) => { states[index] = value; }];
        }, useEffect: (effect) => effects.push(effect),
      };
      if (name === "next/navigation") return { useRouter: () => ({ replace: (href) => redirects.push(href) }) };
      if (name === "lucide-react") return { LogOut: "span" };
      if (name === "./remote-game-archive.mjs") return { prepareRemoteGameArchive: async () => {
        preparations++;
        return { game: identifiedGame, loadArchive };
      } };
      if (name === "./game-play-source.mjs") return playSources;
      if (name === "./game-player/telemetry.mjs") return telemetry;
      if (name === "./local-game-archive.mjs") return { selectGameArchive: (...args) => selections.push(args) };
      return {};
    },
  });
  function render() {
    cursor = 0;
    return module.exports.RemoteArchivePlayer({ zip: "https://example.test/game.zip", recognizedGames });
  }
  render();
  const cleanup = effects.shift()();
  await new Promise(setImmediate);
  return { render, redirects, selections, loadArchive, hash, cleanup, preparations: () => preparations };
}

test("recognized direct ZIP links preserve their fragment and prepared loader when moving to the game route", async () => {
  for (const pathname of ["/local/play", tentacle.playHref]) {
    const app = await remotePlayer(pathname, { target: "monkey-demo", engineId: "scumm", gameId: "monkey",
      displayTitle: "The Secret of Monkey Island (Demo)" });
    assert.deepEqual(app.redirects, [`/the-secret-of-monkey-island-demo/play${app.hash}`]);
    assert.equal(app.selections[0][0], app.loadArchive, "navigation reuses the prepared archive");
    assert.equal(app.selections[0][1].slug, "the-secret-of-monkey-island-demo");
    assert.equal(app.selections[0][1].skipIntro, null);
    assert.equal(app.preparations(), 1);
    app.cleanup();
  }
});

test("a direct ZIP keeps telemetry enabled across the game route redirect", async () => {
  const app = await remotePlayer("/local/play", { target: "monkey-demo", engineId: "scumm", gameId: "monkey",
    displayTitle: "The Secret of Monkey Island (Demo)" }, "?telemetry=1");
  assert.deepEqual(app.redirects, [`/the-secret-of-monkey-island-demo/play?telemetry=1${app.hash}`]);
  app.cleanup();
});

test("canonical direct links keep their game presentation and unidentified ZIPs retain the generic player", async () => {
  for (const [pathname, game] of [[tentacle.playHref, { ...tentacle, slug: undefined, playHref: undefined }], ["/local/play", null]]) {
    const app = await remotePlayer(pathname, game);
    assert.equal(app.redirects.length, 0);
    assert.equal(app.render().props.game?.slug, game ? tentacle.slug : undefined);
    assert.equal(app.render().props.loadArchive, app.loadArchive);
    app.cleanup();
  }
});

test("unidentified ZIPs leave an unrelated game's canonical route", async () => {
  const app = await remotePlayer(tentacle.playHref, null);
  assert.deepEqual(app.redirects, [`/local/play${app.hash}`]);
  assert.equal(app.selections.length, 0);
  app.cleanup();
});
