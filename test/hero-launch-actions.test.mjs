import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import swc from "next/dist/build/swc/index.js";
import { chooseGameVersion, readChosenVersion, rememberGameVersion } from "../app/game-versions.mjs";

await swc.loadBindings();
let savedIdentity = null;
const saveHooks = { useState: () => [savedIdentity, () => {}], useEffect() {} };
let stateIndex = 0, preferredVersion = null;
const staticHooks = { useState: (value) => [stateIndex++ === 2 ? preferredVersion : value, () => {}], useRef: (value) => ({ current: value }), useEffect() {} };

async function loadComponent(path, imports = {}, hooks = saveHooks, globals = {}) {
  const url = new URL(path, import.meta.url);
  const nativeRequire = createRequire(url);
  const { code } = await swc.transform(await readFile(url, "utf8"), {
    filename: url.pathname, swcrc: false, configFile: false,
    module: { type: "commonjs" },
    jsc: { parser: { syntax: "ecmascript", jsx: true }, transform: { react: { runtime: "automatic" } } },
  });
  const compiled = { exports: {} };
  runInNewContext(code, {
    ...globals,
    module: compiled, exports: compiled.exports,
    require(name) {
      if (name === "react") return hooks;
      if (name === "react/jsx-runtime" || name === "lucide-react") return nativeRequire(name);
      return imports[name] || {};
    },
  });
  return compiled.exports.default;
}

const LaunchPending = await loadComponent("../app/launch-pending.js");
const useBrowserSave = (game) => savedIdentity === undefined ? undefined
  : savedIdentity === (game.saveVersionId || game.target) ? 0 : null;
const LaunchButton = await loadComponent("../app/launch-button.js", {
  "./use-browser-save": useBrowserSave, "./launch-pending": LaunchPending,
});
const SourceLaunchActions = await loadComponent("../app/home-shell/source-launch-actions.js", {
  "../use-browser-save": useBrowserSave, "../launch-pending": LaunchPending,
});
const HeroStage = await loadComponent("../app/home-shell/hero-stage.js", {
  "../launch-button": LaunchButton,
  "../launch-pending": LaunchPending,
  "./source-launch-actions": SourceLaunchActions,
  "./decorative-image": () => null,
  "./shell-icon": () => null,
  "./hero-title": ({ children }) => children,
  "./game-screenshots": () => null,
  "./hero-images.mjs": { getHeroImageProps: () => ({}) },
  "./hero-title-fit.mjs": { fitHeroTitle() {} },
  "./shared": { getGameDialogId: () => "game-test", getHeroImageStyle: () => ({}) },
});
const HomeHero = await loadComponent("../app/home-shell/home-hero.js", {
  "next/navigation": { useRouter: () => ({ push() {} }) },
  "./hero-stage": HeroStage,
  "./hero-images.mjs": { getHeroPreloadImages: () => [] },
  "../game-versions.mjs": { getGameFamilyKey: (game) => game.target, chooseGameVersion, readChosenVersion, rememberGameVersion },
}, staticHooks);
const game = { target: "sky", displayTitle: "Beneath a Steel Sky", playHref: "/beneath-a-steel-sky/play" };

function slideFor(versions, launchPending = false, options = {}) {
  stateIndex = 0;
  return HomeHero({ featuredGame: game, groups: [{ key: game.target, title: game.displayTitle,
    game, dialogId: "game-test", versions }], launchPending, ...options });
}

test("game routes render the game's copy and start with rotation paused", () => {
  savedIdentity = null;
  const versions = [{ key: "catalog:sky", game }];
  const slide = slideFor(versions, false, { isHomePage: false, groups: [
    { key: game.target, game, versions },
    { key: "queen", game: { ...game, target: "queen" }, versions },
  ] });
  assert.equal(slide.props.isHomePage, false);
  assert.equal(slide.props.isInitialSlide, true);
  const html = renderToStaticMarkup(slide);
  assert.match(html, /Resume slideshow/);
  assert.match(html, /Beneath a Steel Sky/);
  assert.doesNotMatch(html, /More Info|Back to library|aria-haspopup="dialog"/);
});

test("catalog slideshow offers Continue with the resume URL after a player save", () => {
  const slide = slideFor([{ key: "catalog:sky", game }]);
  savedIdentity = "sky";
  const html = renderToStaticMarkup(slide);
  assert.match(html, /href="\/beneath-a-steel-sky\/play\?launch_from=hero#continue">Continue<\/a>/);
  assert.match(html, />Start from beginning<\/a>/);
  savedIdentity = null;
  const fresh = renderToStaticMarkup(slide);
  assert.match(fresh, /href="\/beneath-a-steel-sky\/play\?launch_from=hero">Play<\/a>/);
  assert.doesNotMatch(fresh, /#continue|Start from beginning/);
});

test("imported slideshow shares save-aware actions and never reuses another version's save", () => {
  const clicks = [];
  const version = { key: "source:zip", source: { id: "zip" }, game: { ...game, saveVersionId: "source:zip" },
    action: { onClick: () => clicks.push("fresh"), onContinue: () => clicks.push("continue") } };
  const slide = slideFor([version]);
  assert.equal(slide.props.sourceVersion, version);
  savedIdentity = version.key;
  assert.match(renderToStaticMarkup(slide), />Continue<\/button>/);
  const view = SourceLaunchActions({ version });
  view.props.children[1].props.onClick();
  view.props.children[2].props.onClick();
  assert.deepEqual(clicks, ["continue", "fresh"]);
  savedIdentity = "source:other";
  const fresh = renderToStaticMarkup(slide);
  assert.match(fresh, />Play<\/button>/);
  assert.doesNotMatch(fresh, />Continue|Start from beginning/);
});

test("file reconnection takes precedence over Continue in the slideshow", () => {
  const version = { key: "source:zip", source: { id: "zip" }, game: { ...game, saveVersionId: "source:zip" },
    action: { needsAccess: true, onClick() {}, onContinue() {} } };
  savedIdentity = version.key;
  const html = renderToStaticMarkup(slideFor([version]));
  assert.match(html, />Allow file access<\/button>/);
  assert.match(html, /aria-describedby="hero-file-access-help"/);
  assert.equal((html.match(/id="hero-file-access-help"/g) || []).length, 1);
  assert.doesNotMatch(html, />Continue|Start from beginning/);
  version.action.needsAccess = false;
  version.locate = true;
  version.locateLabel = "Locate ZIP";
  assert.match(renderToStaticMarkup(slideFor([version])), />Locate ZIP<\/button>/);
});

test("multiple versions expose an inline chooser and launch the selected catalog edition", () => {
  savedIdentity = "sky";
  preferredVersion = { group: game.target, key: "catalog:sky" };
  const slide = slideFor([{ key: "catalog:sky", game }, { key: "source:zip", game, source: { id: "zip" } }]);
  assert.equal(slide.props.sourceVersion, undefined);
  const html = renderToStaticMarkup(slide);
  assert.match(html, /<select/);
  assert.match(html, />Continue<\/a>/);
  assert.doesNotMatch(html, /aria-haspopup="dialog"/);
  preferredVersion = null;
});

test("refresh never exposes a launch action before versions and saves are checked", () => {
  const versions = [{ key: "catalog:sky", game }];
  savedIdentity = "sky";
  const restoring = renderToStaticMarkup(slideFor(versions, true));
  assert.match(restoring, /disabled="" aria-busy="true" aria-label="Checking saved games"/);
  assert.doesNotMatch(restoring, />Continue|#continue|Start from beginning|href="\/beneath-a-steel-sky\/play/);
  savedIdentity = undefined;
  const checking = renderToStaticMarkup(slideFor(versions));
  assert.match(checking, /launch-button-pending/);
  assert.doesNotMatch(checking, />Continue|#continue|href="\/beneath-a-steel-sky\/play/);
  savedIdentity = null;
  assert.match(renderToStaticMarkup(slideFor(versions)), />Play<\/a>/);
  savedIdentity = "sky";
  const restored = [...versions, { key: "source:other", game, source: { id: "other" } }];
  const choosing = renderToStaticMarkup(slideFor(restored));
  assert.match(choosing, /<select/);
  assert.match(choosing, /Checking saved games/);
  assert.doesNotMatch(choosing, />Continue|#continue/);
});

test("imported games wait for saves while access and unavailable actions remain immediate", () => {
  savedIdentity = undefined;
  const version = { key: "source:zip", game, action: { onClick() {}, onContinue() {} } };
  assert.match(renderToStaticMarkup(SourceLaunchActions({ version })), /launch-button-pending/);
  version.action.needsAccess = true;
  assert.match(renderToStaticMarkup(SourceLaunchActions({ version })), />Allow file access<\/button>/);
  assert.match(renderToStaticMarkup(LaunchButton({ game: { ...game, importRequired: true } })), />Game not included/);
});

test("save checks distinguish pending, no save and slot zero without leaking across versions", async () => {
  let state = null, dependencies, pendingEffect, cleanup;
  const requests = [], listeners = new Map(), timers = new Map();
  let timerId = 0;
  const hooks = {
    useState: () => [state, (next) => { state = typeof next === "function" ? next(state) : next; }],
    useEffect(effect, next) {
      if (!dependencies || next.some((value, i) => value !== dependencies[i])) {
        pendingEffect = effect;
        dependencies = next;
      }
    },
  };
  const hook = await loadComponent("../app/use-browser-save.js", {
    "./asset-paths": { scummvmAssetVersion: "test" },
    "./browser-saves.mjs": { getLatestBrowserSave: () => new Promise((resolve) => requests.push(resolve)) },
  }, hooks, { window: {
    addEventListener: (event, fn) => listeners.set(event, fn),
    removeEventListener: (event) => listeners.delete(event),
    setTimeout: (fn, delay) => { assert.equal(delay, 5000); timers.set(++timerId, fn); return timerId; },
    clearTimeout: (id) => timers.delete(id),
  } });
  function commit() { cleanup?.(); cleanup = pendingEffect(); pendingEffect = null; }
  assert.equal(hook(game), undefined);
  commit();
  assert.equal(hook({ ...game }), undefined);
  assert.equal(pendingEffect, null, "equivalent game objects must not restart the pending check");
  for (const timeout of timers.values()) timeout();
  assert.equal(hook(game), null, "a stalled scan must allow Play after five seconds");
  requests.shift()(0);
  await new Promise(setImmediate);
  assert.equal(hook(game), 0);
  for (const timeout of timers.values()) timeout();
  assert.equal(hook(game), 0, "the fallback must preserve a detected save, including slot zero");
  const imported = { ...game, importRequired: true, saveVersionId: "other" };
  assert.equal(hook(imported), undefined);
  commit();
  requests.shift()(null);
  await new Promise(setImmediate);
  assert.equal(hook(imported), null);
  listeners.get("scummweb:saves-changed")();
  listeners.get("storage")();
  const older = requests.shift(), newer = requests.shift();
  newer(2);
  await new Promise(setImmediate);
  older(null);
  await new Promise(setImmediate);
  assert.equal(hook(imported), 2);
  listeners.get("pageshow")();
  cleanup();
  requests.shift()(null);
  await new Promise(setImmediate);
  assert.equal(hook(imported), 2);
  assert.equal(listeners.size, 0);
  assert.equal(timers.size, 0);
});

test("a rejected save check releases the pending launch action", async () => {
  let state = null, effect, cleanup;
  const hook = await loadComponent("../app/use-browser-save.js", {
    "./asset-paths": { scummvmAssetVersion: "test" },
    "./browser-saves.mjs": { getLatestBrowserSave: async () => { throw new Error("storage unavailable"); } },
  }, {
    useState: () => [state, (next) => { state = typeof next === "function" ? next(state) : next; }],
    useEffect: (next) => { effect = next; },
  }, { window: { setTimeout, clearTimeout, addEventListener() {}, removeEventListener() {} } });
  assert.equal(hook(game), undefined);
  cleanup = effect();
  await new Promise(setImmediate);
  assert.equal(hook(game), null);
  cleanup();
});
