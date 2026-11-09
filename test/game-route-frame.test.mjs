import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import test from "node:test";
import swc from "next/dist/build/swc/index.js";
import * as skipIntroConfig from "../app/skip-intro-config.mjs";
import * as telemetry from "../app/game-player/telemetry.mjs";
import * as gameMenu from "../app/game-player/game-menu.mjs";
import * as controllerDevice from "../app/controller-device.mjs";
import { gameLoadingStatus } from "../app/game-loading-status.mjs";

const componentUrl = new URL("../app/game-route-frame.js", import.meta.url);
const nativeRequire = createRequire(componentUrl);
await swc.loadBindings();
const navigator = { userAgent: "Desktop" };
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
      module: compiled, exports: compiled.exports, URL, URLSearchParams, AbortController, navigator,
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
        if (name === "./skip-intro-config.mjs") return skipIntroConfig;
        if (name === "./controller-device.mjs") return controllerDevice;
        if (name.endsWith("/game-menu.mjs")) return gameMenu;
        if (name.endsWith("/telemetry.mjs")) return telemetry;
        if (name === "next/navigation") return { useRouter: () => ({}) };
        if (name === "./game-loading-status.mjs") return { gameLoadingStatus };
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

function pendingArchivePlayer({ stalledNavigation = false, queryTelemetry = false, catalog = true,
  skipIntro, downloadDetails = { loaded: 12_400_000, total: 85_200_000 } } = {}) {
  const archive = Promise.withResolvers();
  const hooks = [];
  const messages = new Set();
  const timers = new Map();
  const deliveries = [];
  const reports = [];
  let cursor = 0;
  let dirty = false;
  let children = [];
  let layouts = [];
  let effects = [];
  let loadCount = 0;
  let confirmations = 0;
  let bootCompleted = false;
  let eventProcessor;
  const frame = {
    contentDocument: { URL: "about:blank", getElementById: () => null },
    contentWindow: { focus() {}, postMessage() {}, location: { replace(href) { if (!stalledNavigation) frame.contentDocument.URL = href; } } },
    addEventListener() {}, removeEventListener() {}, focus() {},
  };
  const window = {
    location: new URL(`https://example.test/sky/play${queryTelemetry ? "?telemetry=1" : ""}`),
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
    module, exports: module.exports, window, URL, URLSearchParams, AbortController, navigator, HTMLElement: class {},
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
      if (name === "@sentry/nextjs") return {
        withScope(callback) {
          try { callback({ addEventProcessor: (processor) => { eventProcessor = processor; } }); }
          finally { eventProcessor = undefined; }
        },
        captureMessage(message, context) {
          const event = { message, request: { url: "https://example.test/play#zip=private" }, breadcrumbs: [{}], transaction: "/play", ...context };
          reports.push({ message, context: eventProcessor ? eventProcessor(event) : event });
        },
      };
      if (name === "./skip-intro-config.mjs") return skipIntroConfig;
      if (name === "./controller-device.mjs") return controllerDevice;
      if (name.endsWith("/game-menu.mjs")) return gameMenu;
      if (name.endsWith("/telemetry.mjs")) return telemetry;
      if (name === "next/navigation") return { useRouter: () => ({}) };
      if (name === "./game-loading-status.mjs") return { gameLoadingStatus };
      if (name === "./game-bucket.mjs") return { readCatalogGameArchive: (_url, { onProgress }) => {
        loadCount++;
        onProgress(13, downloadDetails);
        return archive.promise;
      } };
      if (name.endsWith("/GamePlayerControls")) return Controls;
      if (name.endsWith("/GameBootOverlay")) return Overlay;
      if (name.endsWith("/useBootState")) return { useBootState: () => ({
        hasBootCompleted: bootCompleted, hasBootFailed: false, showSkipIntroButton: Boolean(skipIntro),
      }) };
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
  const props = {
    game: { target: "sky", slug: "sky", engineId: "sky" }, target: "sky", src: "/scummvm.html?localGame=1#sky",
    skipIntro,
    ...(catalog ? { catalogArchiveUrl: "https://example.test/sky.zip" } : { loadArchive: () => archive.promise }),
  };
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
    archive, frame, deliveries, reports, timers, render,
    get children() { return children; },
    get loadCount() { return loadCount; },
    get confirmations() { return confirmations; },
    get overlay() { return children.find(({ type }) => type === Overlay).props; },
    get controls() { return children.find(({ type }) => type === Controls).props; },
    setBootCompleted() { bootCompleted = true; render(); },
    ready(origin = window.location.origin, source = frame.contentWindow) {
      for (const handler of [...messages]) handler({ origin, source, data: { type: "scummweb:local-game-ready" } });
    },
    gameReady(href) {
      for (const handler of [...messages]) handler({ origin: window.location.origin, source: frame.contentWindow,
        data: { type: "scummvm-ready", source: "scummweb", target: "sky", href, reason: "rendered-frame-detected" } });
    },
    bootError({ origin = window.location.origin, source = frame.contentWindow, ...data } = {}) {
      for (const handler of [...messages]) handler({ origin, source, data: {
        type: "scummvm-boot-error", href: frame.contentDocument.URL, stage: "script-error",
        name: "SyntaxError", message: "Unexpected token", ...data,
      } });
    },
    saveSessionBusy(origin = window.location.origin, source = frame.contentWindow) {
      for (const handler of [...messages]) handler({ origin, source, data: { type: "scummweb:save-session-busy" } });
    },
    genericError() {
      for (const handler of [...messages]) handler({ origin: window.location.origin, source: frame.contentWindow,
        data: { type: "scummweb:local-game-status", status: "error" } });
    },
    unmount() { for (const hook of hooks) hook?.cleanup?.(); },
  };
}

test("the intro countdown starts only when the skip button can be seen", () => {
  const player = pendingArchivePlayer({ skipIntro: { strategy: "boot-param", bootParam: 1, durationMinutes: 0.5 } });
  const countdowns = () => [...player.timers.values()].filter(({ delay }) => delay === 30_000);
  player.render();
  assert.equal(player.controls.showSkipIntroAction, false);
  assert.equal(countdowns().length, 0);
  player.setBootCompleted();
  assert.equal(player.controls.showSkipIntroAction, true);
  assert.equal(countdowns().length, 1);
  player.unmount();
  assert.equal(countdowns().length, 0);
});

test("only reports the first recognized startup error from the current player frame", () => {
  const player = pendingArchivePlayer();
  player.render();
  player.bootError({ origin: "https://untrusted.test" });
  player.bootError({ source: {} });
  player.bootError({ href: "/scummvm.html?old=1#sky" });
  player.bootError({ stage: "unknown" });
  assert.equal(player.reports.length, 0);
  player.bootError({ message: "Failed to load https://example.test/scummvm.js?token=secret" });
  player.bootError({ stage: "runtime-abort" });
  assert.equal(player.reports.length, 1);
  const [{ message, context }] = player.reports;
  assert.match(message, /Player JavaScript error/);
  assert.equal(context.tags.startup_stage, "script-error");
  assert.equal(context.tags.game_slug, "sky");
  assert.equal(context.contexts.scummvm.error_name, "SyntaxError");
  assert.equal(context.contexts.scummvm.detail, "Failed to load [url]");
  player.unmount();
});

test("an imported game's startup report omits its identity and error text", () => {
  const player = pendingArchivePlayer({ catalog: false });
  player.render();
  player.bootError({ message: "Failed to open private-file.zip" });
  const [{ context }] = player.reports;
  assert.equal(context.tags.game_source, "local");
  assert.equal(context.tags.game_slug, undefined);
  assert.equal(context.contexts.scummvm.engine, undefined);
  assert.equal(context.contexts.scummvm.detail, undefined);
  assert.equal(context.request, undefined);
  assert.equal(context.breadcrumbs, undefined);
  assert.equal(context.transaction, undefined);
  player.unmount();
});

test("a runtime failure after the first game frame is not a startup error", () => {
  const player = pendingArchivePlayer();
  player.render();
  player.gameReady(player.frame.contentDocument.URL);
  player.bootError();
  assert.equal(player.reports.length, 0);
  player.unmount();
});

test("the play route forwards telemetry only for the opted-in game frame", () => {
  for (const telemetry of [false, true]) {
    const player = pendingArchivePlayer({ queryTelemetry: telemetry });
    player.render();
    const frame = new URL(player.frame.contentDocument.URL);
    assert.equal(frame.searchParams.get("telemetry"), telemetry ? "1" : null);
    assert.equal(frame.searchParams.get("localGame"), "1");
    assert.equal(frame.hash, "#sky");
    player.unmount();
  }
});

test("save-lock contention explains recovery and rejects messages from unrelated frames", () => {
  const player = pendingArchivePlayer();
  player.render();
  player.saveSessionBusy("https://untrusted.test");
  player.saveSessionBusy("https://example.test", {});
  player.render();
  assert.equal(player.overlay.hasBootFailed, false);
  player.saveSessionBusy();
  player.genericError();
  player.render();
  assert.equal(player.overlay.hasBootFailed, true);
  assert.match(player.overlay.bootStatusText, /Close it in the other tab/);
  player.unmount();
});

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
    assert.equal(player.overlay.bootStatusText, "Loading game (12.4 / 85.2 MB)…");
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

for (const [downloadDetails, label] of [
  [{ loaded: 12_400_000, total: null }, "Loading game (12.4 MB)…"],
  [{ loaded: 0, total: 85_200_000 }, "Loading game (0.0 / 85.2 MB)…"],
  [{ cached: true }, "Opening cached game…"],
  [{}, "Loading game…"],
]) {
  test(`archive loading status: ${label}`, () => {
    const player = pendingArchivePlayer({ downloadDetails });
    player.render();
    assert.equal(player.overlay.bootStatusText, label);
    player.unmount();
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

function readyPlayer(game, { ready = true, failed = false, mobile = false } = {}) {
  function Controls() {}
  function CursorPad() {}
  const keypresses = [];
  const commands = [];
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
      if (name === "./skip-intro-config.mjs") return skipIntroConfig;
      if (name === "next/navigation") return { useRouter: () => ({}) };
      if (name.endsWith("/game-menu.mjs")) return gameMenu;
      if (name.endsWith("/telemetry.mjs")) return telemetry;
      if (name.endsWith("/keyboard")) return {
        dispatchSyntheticKeypressSequence: async (frame, shortcut) => keypresses.push({ frame, shortcut }),
        dispatchGameCommand: (frame, command) => commands.push({ frame, command }),
      };
      if (name.endsWith("/GamePlayerControls")) return Controls;
      if (name.endsWith("/GameTouchCursorPad")) return CursorPad;
      if (name.endsWith("/useBootState")) return { useBootState: () => ({
        hasBootCompleted: ready, hasBootPresentationCompleted: ready,
        showGameMenuButton: ready, hasBootFailed: failed,
      }) };
      if (name.endsWith("/useImmersiveMode")) return { useImmersiveMode: () => ({ isMobileViewport: mobile }) };
      if (name.endsWith("/useTouchClickMode")) return { useTouchClickActions: () => ({}) };
      if (name.endsWith("/useTouchCursorPad")) return { useTouchCursorPad: () => ({}) };
      if (name.endsWith("/game-launch-analytics.mjs")) return { createGameLaunchAnalytics: () => ({}) };
      return {};
    },
  });
  const children = module.exports.default({ game, target: game.target, src: "/scummvm.html#game" }).props.children.filter(Boolean);
  return {
    controls: children.find(({ type }) => type === Controls).props,
    cursorPad: children.find(({ type }) => type === CursorPad).props,
    form: children.find(({ type }) => type === "form"),
    frame, keypresses, commands,
  };
}

for (const [game, expectedKey] of [
  [{ engineId: "sky", gameId: "sky", target: "sky" }, "F5"],
  [{ engineId: "queen", gameId: "queen", target: "queen" }, "F1"],
  [{ engineId: "scumm", gameId: "monkey", target: "monkey-demo" }, null],
  [{ engineId: "sci", gameId: "phantasmagoria", target: "phantasmagoria" }, null],
  [{ target: "unknown-import" }, null],
]) {
  test(`menu control uses only a supported native action for ${game.target}`, async () => {
    const player = readyPlayer(game);
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
    assert.equal(readyPlayer(game, state).controls.showGameMenuButton, false);
  }
});

test("ready Apple II adventures replace mobile mouse controls with a command form", () => {
  const game = { engineId: "adl", gameId: "hires1", target: "hires1" };
  const player = readyPlayer(game, { mobile: true });
  assert.equal(player.controls.showTouchClickButtons, false);
  assert.equal(player.cursorPad.showTouchCursorPad, false);
  let blurred = false;
  let prevented = false;
  const input = { value: "go east", blur: () => { blurred = true; } };
  player.form.props.onSubmit({
    preventDefault: () => { prevented = true; },
    currentTarget: { elements: { namedItem: (name) => name === "command" ? input : null } },
  });
  assert.equal(prevented, true);
  assert.equal(blurred, true);
  assert.equal(input.value, "");
  assert.deepEqual(player.commands, [{ frame: player.frame, command: "go east" }]);

  assert.equal(readyPlayer(game).form, undefined);
  assert.equal(readyPlayer(game, { mobile: true, ready: false }).form, undefined);
  assert.equal(readyPlayer(game, { mobile: true, failed: true }).form, undefined);
  const mousePlayer = readyPlayer({ engineId: "sky", target: "sky" }, { mobile: true });
  assert.equal(mousePlayer.form, undefined);
  assert.equal(mousePlayer.controls.showTouchClickButtons, true);
  assert.equal(mousePlayer.cursorPad.showTouchCursorPad, true);
});
