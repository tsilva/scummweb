import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import test from "node:test";
import swc from "next/dist/build/swc/index.js";
import * as gameMenu from "../app/game-player/game-menu.mjs";

const componentUrl = new URL("../app/game-route-frame.js", import.meta.url);
const nativeRequire = createRequire(componentUrl);
await swc.loadBindings();
const { code } = await swc.transform(await readFile(componentUrl, "utf8"), {
  filename: componentUrl.pathname, swcrc: false, configFile: false,
  module: { type: "commonjs" },
  jsc: { parser: { syntax: "ecmascript", jsx: true }, transform: { react: { runtime: "automatic" } } },
});

for (const message of ["This ZIP link returned HTTP 404.", "Could not download the ZIP."]) {
  test(`Exit remains usable after an intro-enabled game's archive fails: ${message}`, async () => {
    const states = [];
    const effects = [];
    const navigations = [];
    let stateIndex = 0;
    let downloads = 0;
    function Controls() {}
    function Overlay() {}
    const compiled = { exports: {} };
    runInNewContext(code, {
      module: compiled, exports: compiled.exports, URL, URLSearchParams, AbortController,
      window: { location: {
        href: "https://example.test/beneath-a-steel-sky/play", origin: "https://example.test",
        hash: "", search: "", replace: (href) => navigations.push(href),
      } },
      require(name) {
        if (name === "react") return {
          useState(initial) {
            const index = stateIndex++;
            if (!(index in states)) states[index] = typeof initial === "function" ? initial() : initial;
            return [states[index], (value) => { states[index] = value; }];
          },
          useRef: (current) => ({ current }), useCallback: (callback) => callback,
          useEffect: (effect) => effects.push(effect), useLayoutEffect() {},
        };
        if (name === "react/jsx-runtime") return nativeRequire(name);
        if (name.endsWith("/game-menu.mjs")) return gameMenu;
        if (name === "next/navigation") return { useRouter: () => ({}) };
        if (name === "./game-bucket.mjs") return { readCatalogGameArchive: async () => {
          downloads++;
          throw new Error(message);
        } };
        if (name.endsWith("/GamePlayerControls")) return Controls;
        if (name.endsWith("/GameBootOverlay")) return Overlay;
        if (name.endsWith("/useBootState")) return { useBootState: () => ({
          hasBootCompleted: false, hasBootFailed: false, showSkipIntroButton: false,
        }) };
        if (name.endsWith("/useImmersiveMode")) return { useImmersiveMode: () => ({}) };
        if (name.endsWith("/useTouchClickMode")) return { useTouchClickActions: () => ({ touchControlsUnlocked: false }) };
        if (name.endsWith("/useTouchCursorPad")) return { useTouchCursorPad: () => ({}) };
        if (name.endsWith("/game-launch-analytics.mjs")) return { createGameLaunchAnalytics: () => ({ start() {}, fail() {} }) };
        if (name === "./recent-games") return { recordRecentGameTarget() {} };
        if (name.endsWith("/startup-diagnostics.mjs")) return { observeStartupDiagnostics() {} };
        return {};
      },
    });
    function render() {
      stateIndex = 0;
      return compiled.exports.default({
        game: { target: "sky", slug: "beneath-a-steel-sky" }, target: "sky",
        src: "/scummvm.html?exitTo=%2F%23library#sky", skipIntro: { slot: 0 },
        catalogArchiveUrl: "https://example.test/sky.zip",
      }).props.children.filter(Boolean);
    }
    render();
    for (const effect of effects.splice(0)) effect();
    await new Promise(setImmediate);

    const children = render();
    assert.equal(downloads, 1);
    const overlay = children.find(({ type }) => type === Overlay);
    assert.equal(overlay.props.hasBootFailed, true);
    assert.equal(overlay.props.bootStatusText, message);
    const controls = children.find(({ type }) => type === Controls);
    assert.equal(controls.props.showExitControl, true);
    await controls.props.onExit();
    assert.deepEqual(navigations, ["/#library"]);
  });
}

function pendingArchivePlayer({ stalledNavigation = false } = {}) {
  const archive = Promise.withResolvers();
  const hooks = [];
  const messages = new Set();
  const timers = new Map();
  const deliveries = [];
  let cursor = 0;
  let dirty = false;
  let children = [];
  let layouts = [];
  let effects = [];
  let loadCount = 0;
  let confirmations = 0;
  const frame = {
    contentDocument: { URL: "about:blank", getElementById: () => null },
    contentWindow: { focus() {}, postMessage() {}, location: { replace(href) { if (!stalledNavigation) frame.contentDocument.URL = href; } } },
    addEventListener() {}, removeEventListener() {}, focus() {},
  };
  const window = {
    location: { href: "https://example.test/sky/play", origin: "https://example.test", hash: "", search: "" },
    setTimeout(callback, delay) { const id = Symbol(); timers.set(id, { callback, delay }); return id; },
    clearTimeout(id) { timers.delete(id); },
    addEventListener(name, handler) { if (name === "message") messages.add(handler); },
    removeEventListener(name, handler) { if (name === "message") messages.delete(handler); },
  };
  function memo(factory, deps) {
    const index = cursor++;
    if (!hooks[index] || deps.some((dep, n) => !Object.is(dep, hooks[index].deps[n]))) {
      hooks[index] = { deps, value: factory() };
    }
    return hooks[index].value;
  }
  function effect(callback, deps, queue) {
    const index = cursor++;
    const previous = hooks[index];
    if (!previous || !deps || deps.some((dep, n) => !Object.is(dep, previous.deps[n]))) {
      const entry = { deps };
      hooks[index] = entry;
      queue.push(() => { previous?.cleanup?.(); entry.cleanup = callback(); });
    }
  }
  function Controls() {}
  function Overlay() {}
  const module = { exports: {} };
  runInNewContext(code, {
    module, exports: module.exports, window, URL, URLSearchParams, AbortController, HTMLElement: class {},
    fetch: async () => ({ ok: true, text: async () => "<html><head></head><body></body></html>" }),
    require(name) {
      if (name === "react") return {
        useState(initial) {
          const index = cursor++;
          hooks[index] ??= { value: typeof initial === "function" ? initial() : initial };
          return [hooks[index].value, (update) => {
            const value = typeof update === "function" ? update(hooks[index].value) : update;
            if (!Object.is(value, hooks[index].value)) { hooks[index].value = value; dirty = true; }
          }];
        },
        useRef: (current) => memo(() => ({ current }), []),
        useCallback: (callback, deps) => memo(() => callback, deps),
        useEffect: (callback, deps) => effect(callback, deps, effects),
        useLayoutEffect: (callback, deps) => effect(callback, deps, layouts),
      };
      if (name === "react/jsx-runtime") return nativeRequire(name);
      if (name.endsWith("/game-menu.mjs")) return gameMenu;
      if (name === "next/navigation") return { useRouter: () => ({}) };
      if (name === "./game-bucket.mjs") return { readCatalogGameArchive: (_url, { onProgress }) => {
        loadCount++;
        onProgress(13);
        return archive.promise;
      } };
      if (name.endsWith("/GamePlayerControls")) return Controls;
      if (name.endsWith("/GameBootOverlay")) return Overlay;
      if (name.endsWith("/useBootState")) return { useBootState: () => ({ hasBootCompleted: false, hasBootFailed: false }) };
      if (name.endsWith("/useImmersiveMode")) return { useImmersiveMode: () => ({}) };
      if (name.endsWith("/useTouchClickMode")) return { useTouchClickActions: () => ({}) };
      if (name.endsWith("/useTouchCursorPad")) return { useTouchCursorPad: () => ({}) };
      if (name.endsWith("/game-launch-analytics.mjs")) return { createGameLaunchAnalytics: () => ({ start() {}, fail() {}, confirm() { confirmations++; } }) };
      if (name.endsWith("/startup-diagnostics.mjs")) return { observeStartupDiagnostics() {} };
      if (name === "./recent-games") return { recordRecentGameTarget() {} };
      if (name.endsWith("/zip-game-player")) return { sendZipGameFiles: (receiver, files) => deliveries.push({ receiver, files }) };
      return {};
    },
  });
  const props = { game: { target: "sky", slug: "sky" }, target: "sky", src: "/scummvm.html?localGame=1#sky", catalogArchiveUrl: "https://example.test/sky.zip" };
  function render() {
    let attempts = 0;
    do {
      assert.ok(attempts++ < 20, "component should settle");
      dirty = false;
      cursor = 0;
      children = module.exports.default(props).props.children.filter(Boolean);
      const iframe = children.find(({ type }) => type === "iframe");
      if (iframe) iframe.props.ref.current = frame;
      for (const run of layouts.splice(0)) run();
      for (const run of effects.splice(0)) run();
    } while (dirty);
  }
  return {
    archive, frame, deliveries, timers, render,
    get children() { return children; },
    get loadCount() { return loadCount; },
    get confirmations() { return confirmations; },
    get overlay() { return children.find(({ type }) => type === Overlay).props; },
    ready(origin = window.location.origin, source = frame.contentWindow) {
      for (const handler of [...messages]) handler({ origin, source, data: { type: "scummweb:local-game-ready" } });
    },
    gameReady(href) {
      for (const handler of [...messages]) handler({ origin: window.location.origin, source: frame.contentWindow,
        data: { type: "scummvm-ready", source: "scummweb", target: "sky", href, reason: "rendered-frame-detected" } });
    },
    unmount() { for (const hook of hooks) hook?.cleanup?.(); },
  };
}

test("a slow archive keeps the fallback frame identity through the first-frame message", async () => {
  const player = pendingArchivePlayer({ stalledNavigation: true });
  player.render();
  await [...player.timers.values()].find(({ delay }) => delay === 8000).callback();
  player.render();
  player.ready();
  player.archive.resolve([{ path: "sky.dnr", data: Uint8Array.of(1) }]);
  await new Promise(setImmediate);
  player.render();
  assert.equal(player.deliveries.length, 1);
  player.gameReady("/scummvm.html?localGame=1&launchRetry=inline#sky");
  assert.equal(player.confirmations, 1, "the parent accepts the actual fallback frame's ready message");
  player.unmount();
});

for (const runtimeFirst of [true, false]) {
  test(`parallel launch hands off exactly once when ${runtimeFirst ? "runtime" : "archive"} is ready first`, async () => {
    const player = pendingArchivePlayer();
    player.render();
    assert.ok(player.children.some(({ type }) => type === "iframe"), "runtime starts before the ZIP finishes");
    assert.equal(player.overlay.bootStatusText, "Downloading game ZIP (13%)…");
    assert.equal([...player.timers.values()].some(({ delay }) => delay === 120_000), false, "slow downloads do not trip the runtime timeout");
    player.ready("https://untrusted.test");
    player.ready("https://example.test", {});
    if (runtimeFirst) player.ready();
    assert.equal(player.deliveries.length, 0);
    const files = [{ path: "sky.dnr", data: Uint8Array.of(1, 2, 3) }];
    player.archive.resolve(files);
    await new Promise(setImmediate);
    player.render();
    if (!runtimeFirst) { assert.equal(player.deliveries.length, 0); player.ready(); }
    assert.equal(player.deliveries.length, 1);
    assert.equal(player.deliveries[0].receiver, player.frame.contentWindow);
    assert.equal(player.deliveries[0].files, files);
    player.ready();
    assert.equal(player.deliveries.length, 1);
    assert.equal(player.loadCount, 1);
    player.unmount();
    assert.equal(player.timers.size, 0);
  });
}

test("leaving a pending launch cancels its handoff", async () => {
  const player = pendingArchivePlayer();
  player.render();
  player.ready();
  player.unmount();
  player.archive.resolve([{ path: "sky.dnr", data: Uint8Array.of(1) }]);
  await new Promise(setImmediate);
  assert.equal(player.deliveries.length, 0);
});

function menuPlayer(game, { ready = true, failed = false } = {}) {
  function Controls() {}
  const keypresses = [];
  const frame = { contentWindow: {} };
  let refIndex = 0;
  const module = { exports: {} };
  runInNewContext(code, {
    module, exports: module.exports, URL, URLSearchParams,
    window: { location: { href: "https://example.test/play", origin: "https://example.test", hash: "", search: "" } },
    require(name) {
      if (name === "react") return {
        useState: (value) => [typeof value === "function" ? value() : value, () => {}],
        useRef: (current) => ({ current: refIndex++ === 1 ? frame : current }),
        useCallback: (callback) => callback,
        useEffect() {}, useLayoutEffect() {},
      };
      if (name === "react/jsx-runtime") return nativeRequire(name);
      if (name === "next/navigation") return { useRouter: () => ({}) };
      if (name.endsWith("/game-menu.mjs")) return gameMenu;
      if (name.endsWith("/keyboard")) return { dispatchSyntheticKeypressSequence: async (frame, shortcut) => keypresses.push({ frame, shortcut }) };
      if (name.endsWith("/GamePlayerControls")) return Controls;
      if (name.endsWith("/useBootState")) return { useBootState: () => ({
        hasBootCompleted: ready, hasBootPresentationCompleted: ready,
        showGameMenuButton: ready, hasBootFailed: failed,
      }) };
      if (name.endsWith("/useImmersiveMode")) return { useImmersiveMode: () => ({}) };
      if (name.endsWith("/useTouchClickMode")) return { useTouchClickActions: () => ({}) };
      if (name.endsWith("/useTouchCursorPad")) return { useTouchCursorPad: () => ({}) };
      if (name.endsWith("/game-launch-analytics.mjs")) return { createGameLaunchAnalytics: () => ({}) };
      return {};
    },
  });
  const children = module.exports.default({ game, target: game.target, src: "/scummvm.html#game" }).props.children.filter(Boolean);
  return { controls: children.find(({ type }) => type === Controls).props, frame, keypresses };
}

for (const [game, expectedKey] of [
  [{ engineId: "sky", gameId: "sky", target: "sky" }, "F5"],
  [{ engineId: "queen", gameId: "queen", target: "queen" }, "F1"],
  [{ engineId: "scumm", gameId: "monkey", target: "monkey-demo" }, null],
  [{ engineId: "sci", gameId: "phantasmagoria", target: "phantasmagoria" }, null],
  [{ target: "unknown-import" }, null],
]) {
  test(`menu control uses only a supported native action for ${game.target}`, async () => {
    const player = menuPlayer(game);
    assert.equal(player.controls.showGameMenuButton, Boolean(expectedKey));
    await player.controls.onOpenMenu();
    assert.equal(player.keypresses.length, expectedKey ? 1 : 0);
    if (expectedKey) {
      assert.equal(player.keypresses[0].frame, player.frame);
      assert.equal(player.keypresses[0].shortcut.key, expectedKey);
      assert.equal(Boolean(player.keypresses[0].shortcut.ctrlKey), false);
    }
  });
}

test("native menu stays hidden while loading and after a boot failure", () => {
  const game = { engineId: "sky", gameId: "sky", target: "sky" };
  for (const state of [{ ready: false }, { failed: true }]) {
    assert.equal(menuPlayer(game, state).controls.showGameMenuButton, false);
  }
});
