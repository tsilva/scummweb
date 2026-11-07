import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import swc from "next/dist/build/swc/index.js";
import { chooseGameVersion, formatVersionLabel, readChosenVersion, rememberGameVersion } from "../app/game-versions.mjs";
import * as initialActions from "../app/home-shell/initial-actions.mjs";

await swc.loadBindings();
let savedIdentity = null;
const saveHooks = { useState: () => [savedIdentity, () => {}], useEffect() {} };
let stateIndex = 0, preferredVersion = null, heroMedia = null, preloadCalls = 0;
let heroImageProps = {};
const imagePreloads = [];
const staticHooks = {
  useState(value) {
    const index = stateIndex++;
    return [[value, heroMedia, preferredVersion][index] ?? value, () => {}];
  },
  useRef: (value) => ({ current: value }), useEffect() {}, useLayoutEffect() {},
};

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
      if (name === "./initial-actions.mjs") return imports[name] || initialActions;
      if (name.endsWith("/useLaunchFeedback")) return imports[name] || (() => ({ show() {}, dismiss() {}, overlay: null }));
      return imports[name] || {};
    },
  });
  return compiled.exports.default;
}

const LaunchPending = await loadComponent("../app/launch-pending.js");
const useBrowserSave = (game) => savedIdentity === undefined ? undefined
  : savedIdentity === (game.saveVersionId || game.target) ? 0 : null;
const LaunchButton = await loadComponent("../app/launch-button.js", {
  "next/navigation": { useRouter: () => ({ push() {} }) },
  "./game-player/immersive-mode.mjs": { beginMobileGameLaunch: () => false },
  "./use-browser-save": useBrowserSave, "./browser-saves.mjs": { cancelBrowserSaveQueries() {} },
});
const SourceLaunchActions = await loadComponent("../app/home-shell/source-launch-actions.js", {
  "../game-player/immersive-mode.mjs": { beginMobileGameLaunch: () => false },
  "../use-browser-save": useBrowserSave, "../browser-saves.mjs": { cancelBrowserSaveQueries() {} },
});
const HeroStage = await loadComponent("../app/home-shell/hero-stage.js", {
  "./artwork-delivery": { useArtworkDelivery: () => undefined },
  "react-dom": { preload: (url, options) => imagePreloads.push({ url, ...options }) },
  "../game-versions.mjs": { formatVersionLabel },
  "./initial-actions.mjs": { initialActionsMarkup: "" },
  "../launch-button": LaunchButton,
  "../launch-pending": LaunchPending,
  "./source-launch-actions": SourceLaunchActions,
  "./decorative-image": () => null,
  "./shell-icon": () => null,
  "./hero-title": ({ children }) => children,
  "./game-screenshots": () => null,
  "./hero-images.mjs": { getHeroImageProps: () => heroImageProps },
  "./hero-title-fit.mjs": { fitHeroTitle() {} },
  "./shared": { getGameDialogId: () => "game-test", getHeroImageStyle: () => ({}), getDialogLinkProps: () => ({}) },
});
const HomeHero = await loadComponent("../app/home-shell/home-hero.js", {
  "./artwork-delivery": { useArtworkDelivery: () => undefined },
  "./game-navigation": { useGameNavigation: () => null },
  "next/navigation": { useRouter: () => ({ push() {} }) },
  "./hero-stage": HeroStage,
  "./hero-images.mjs": { getHeroPreloadImages: () => { preloadCalls += 1; return []; } },
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

test("homepage ships desktop and mobile copy together before hydration", () => {
  const html = renderToStaticMarkup(slideFor([{ key: "catalog:sky", game }], false, { isHomePage: true }));
  assert.match(html, /class="hero-desktop-copy"/);
  assert.match(html, /class="hero-mobile-copy">Beneath a Steel Sky<\/span>/);
});

test("slideshow preloads wait until the viewport is known to be desktop", () => {
  const versions = [{ key: "catalog:sky", game }];
  preloadCalls = 0;
  try {
    slideFor(versions);
    heroMedia = { matches: true };
    slideFor(versions);
    assert.equal(preloadCalls, 0);
    heroMedia = { matches: false };
    slideFor(versions);
    assert.equal(preloadCalls, 1);
  } finally {
    heroMedia = null;
  }
});

test("the initial AVIF hero preloads the same responsive source used by the picture", () => {
  heroImageProps = { avifSrcSet: "/hero-640.avif 640w, /hero.avif 1600w", sizes: "100vw" };
  try {
    HeroStage({ featuredGame: game });
    HeroStage({ featuredGame: game, isInitialSlide: false });
    assert.deepEqual(imagePreloads, [{
      url: "/hero-640.avif", as: "image", type: "image/avif", fetchPriority: "high",
      imageSrcSet: heroImageProps.avifSrcSet, imageSizes: heroImageProps.sizes,
    }]);
  } finally {
    heroImageProps = {};
    imagePreloads.length = 0;
  }
});

test("the license row stays present without an active link when an edition has no readme", () => {
  const included = renderToStaticMarkup(HeroStage({ featuredGame: { ...game, infoHref: "/launcher/notices/sky.txt" } }));
  assert.match(included, /<a class="hero-license" href="\/launcher\/notices\/sky.txt">Readme \/ License<\/a>/);
  const imported = renderToStaticMarkup(HeroStage({ featuredGame: game }));
  assert.match(imported, /<a class="hero-license" data-reserved="true" aria-hidden="true">Readme \/ License<\/a>/);
});

test("catalog slideshow offers Continue with the resume URL after a player save", () => {
  const slide = slideFor([{ key: "catalog:sky", game }]);
  savedIdentity = "sky";
  const html = renderToStaticMarkup(slide);
  assert.match(html, /href="\/beneath-a-steel-sky\/play\?launch_from=hero#continue">Continue<\/a>/);
  assert.match(html, />Start from beginning<\/a>/);
  assert.doesNotMatch(html, /browse-games-button/);
  savedIdentity = null;
  const fresh = renderToStaticMarkup(slide);
  assert.match(fresh, /href="\/beneath-a-steel-sky\/play\?launch_from=hero">Play<\/a>/);
  assert.doesNotMatch(fresh, /#continue|Start from beginning/);
  assert.match(fresh, /class="secondary-button browse-games-button" href="#library">Browse Games<\/a>/);
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
  assert.match(fresh, /href="#library">Browse Games<\/a>/);
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
  assert.match(html, /href="#library">Browse Games<\/a>/);
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
  assert.match(html, /class="hero-edition" title="Included version">Included version/);
  assert.doesNotMatch(html, /class="hero-edition" (?:data-reserved|aria-hidden)/);
  assert.doesNotMatch(html, /class="hero-version-control" data-reserved/);
  assert.match(html, />Continue<\/a>/);
  assert.doesNotMatch(html, /aria-haspopup="dialog"/);
  preferredVersion = null;
});

test("one version shows an edition badge with an empty, non-focusable chooser slot", () => {
  const label = "DOS · CD · v0.0372";
  const html = renderToStaticMarkup(slideFor([{ key: "catalog:sky",
    game: { ...game, platform: "DOS", media: "CD", revision: "v0.0372" }, label }]));
  assert.match(html, /<li class="hero-edition" title="DOS · CD">DOS · CD<\/li>/);
  assert.match(html, /<div class="hero-version-control" data-reserved="true" aria-hidden="true"><\/div>/);
  assert.doesNotMatch(html, /<select|hero-version-value/);
});

test("restoring an imported edition keeps the category and revision-free badge stable", () => {
  const included = { key: "catalog:sky", label: "DOS · CD · v0.0372",
    game: { ...game, genre: "Cyberpunk adventure", platform: "DOS", media: "CD", revision: "v0.0372" } };
  const imported = { key: "source:zip", source: { id: "zip" }, status: "available", label: "DOS · CD · v0.0368",
    game: { ...included.game, genre: "Adventure", revision: "v0.0368" }, action: { onClick() {} } };
  const options = { isHomePage: false, groups: [{ key: game.target, game: included.game,
    versions: [included, imported] }] };
  for (const key of [null, imported.key]) {
    preferredVersion = key ? { group: game.target, key } : null;
    const html = renderToStaticMarkup(slideFor([included], false, key ? options : {
      ...options, groups: [{ ...options.groups[0], versions: [included] }],
    }));
    assert.match(html, /<li>Cyberpunk adventure<\/li>/);
    assert.match(html, /<li class="hero-edition" title="DOS · CD">DOS · CD<\/li>/);
    assert.match(html, /<span class="hero-edition" title="DOS · CD">DOS · CD<\/span>/);
    assert.doesNotMatch(html, /hero-edition[^>]*(?:data-reserved|aria-hidden)/);
    if (key) assert.match(html, /<option value="source:zip" selected="">DOS · CD · v0.0368/);
  }
  preferredVersion = null;
});

test("hero stays actionable while unrelated sources and version preferences restore", () => {
  const versions = [{ key: "catalog:sky", game }];
  savedIdentity = "sky";
  assert.match(renderToStaticMarkup(slideFor(versions, true)), />Continue<\/a>/);
  savedIdentity = undefined;
  const checking = renderToStaticMarkup(slideFor(versions));
  assert.match(checking, />Play<\/a>/);
  assert.doesNotMatch(checking, /Checking saves|launch-button-pending/);
  savedIdentity = "sky";
  const restored = [...versions, { key: "source:other", game, source: { id: "other" }, status: "checking" }];
  const choosing = renderToStaticMarkup(slideFor(restored));
  assert.match(choosing, /<select/);
  assert.match(choosing, />Continue<\/a>/);
});

test("imports offer Play during save reconciliation and retain access/reconnection actions", () => {
  savedIdentity = undefined;
  const version = { key: "source:zip", game, action: { onClick() {}, onContinue() {} } };
  assert.match(renderToStaticMarkup(SourceLaunchActions({ version })), />Play<\/button>/);
  version.action.needsAccess = true;
  assert.match(renderToStaticMarkup(SourceLaunchActions({ version })), />Allow file access<\/button>/);
  assert.match(renderToStaticMarkup(LaunchButton({ game: { ...game, importRequired: true } })), />Game not included/);
});

test("save hook reads cached slots synchronously with a hydration-safe Play fallback", async () => {
  const slots = new Map([["sky", 0], ["version-b", 2]]);
  let subscription, serverSnapshot;
  const hook = await loadComponent("../app/use-browser-save.js", {
    "./asset-paths": { scummvmAssetVersion: "test" },
    "./browser-saves.mjs": {
      getCachedBrowserSave: (identity) => slots.get(identity.saveVersionId || identity.target) ?? null,
      subscribeBrowserSaves: () => { throw new Error("render must not start a native query"); },
    },
  }, {
    useCallback: (fn) => fn,
    useSyncExternalStore: (subscribe, snapshot, server) => {
      subscription = subscribe; serverSnapshot = server; return snapshot();
    },
  });
  assert.equal(hook(game), 0, "slot zero must be available on the first client snapshot");
  assert.equal(serverSnapshot(), null, "server and initial hydration HTML use Play");
  assert.equal(hook({ ...game, saveVersionId: "version-b" }), 2);
  assert.equal(hook({ ...game, saveVersionId: "version-c" }), null);
  assert.equal(hook(game, false), null);
  assert.equal(typeof subscription(() => {}), "function");
});


test("catalog launches keep the document and request mobile fullscreen within the gesture", async () => {
  const calls = [];
  let mobile = false;
  const CatalogLaunch = await loadComponent("../app/launch-button.js", {
    "./game-player/useLaunchFeedback": () => ({ show() { calls.push("loading screen"); }, overlay: null }),
    "./use-browser-save": () => 0,
    "./browser-saves.mjs": { cancelBrowserSaveQueries() { calls.push("cancel saves"); } },
    "next/navigation": { useRouter: () => ({ push(href) { calls.push(href); } }) },
    "./game-player/immersive-mode.mjs": { beginMobileGameLaunch() { if (mobile) calls.push("fullscreen"); return mobile; } },
  });
  const links = CatalogLaunch({ game, entryPoint: "hero" }).props.children;
  for (mobile of [false, true]) {
    for (const link of links.filter(Boolean)) {
      calls.length = 0;
      link.props.onClick({ button: 0, currentTarget: { getAttribute: () => link.props.href },
        preventDefault() { calls.push("prevent navigation"); } });
      assert.deepEqual(calls, ["prevent navigation", "loading screen", "cancel saves",
        ...(mobile ? ["fullscreen"] : []), link.props.href]);
    }
  }
  calls.length = 0;
  links[0].props.onClick({ button: 0, ctrlKey: true });
  assert.deepEqual(calls, []);
});

test("source file-access and locate actions do not request fullscreen", async () => {
  const calls = [];
  const SourceActions = await loadComponent("../app/home-shell/source-launch-actions.js", {
    "../use-browser-save": () => null,
    "../browser-saves.mjs": { cancelBrowserSaveQueries() {} },
    "../game-player/immersive-mode.mjs": { beginMobileGameLaunch() { calls.push("fullscreen"); } },
  });
  for (const status of [{}, { locate: true }, { needsAccess: true }]) {
    calls.length = 0;
    const component = SourceActions({ version: { game, locate: status.locate,
      action: { needsAccess: status.needsAccess, onClick() { calls.push("action"); } } } });
    component.props.children[1].props.onClick();
    assert.deepEqual(calls, status.locate || status.needsAccess ? ["action"] : ["fullscreen", "action"]);
  }
});


test("source launch feedback appears before asynchronous preparation and clears on failure", async () => {
  const calls = [];
  const SourceActions = await loadComponent("../app/home-shell/source-launch-actions.js", {
    "../use-browser-save": () => null,
    "../browser-saves.mjs": { cancelBrowserSaveQueries() {} },
    "../game-player/useLaunchFeedback": () => ({
      show(value) { assert.equal(value, game); calls.push("loading screen"); },
      dismiss() { calls.push("dismiss"); }, overlay: null,
    }),
    "../game-player/immersive-mode.mjs": { beginMobileGameLaunch() { calls.push("fullscreen"); } },
  });
  for (const navigated of [true, false]) {
    calls.length = 0;
    const pending = Promise.withResolvers();
    const component = SourceActions({ version: { game, action: { onClick() { calls.push("prepare"); return pending.promise; } } } });
    component.props.children[1].props.onClick();
    assert.deepEqual(calls, ["loading screen", "fullscreen", "prepare"]);
    pending.resolve(navigated);
    await new Promise(setImmediate);
    assert.deepEqual(calls, navigated ? ["loading screen", "fullscreen", "prepare"] : ["loading screen", "fullscreen", "prepare", "dismiss"]);
  }
  for (const status of [{ locate: true }, { needsAccess: true }]) {
    calls.length = 0;
    const component = SourceActions({ version: { game, locate: status.locate,
      action: { needsAccess: status.needsAccess, onClick() { calls.push("access"); } } } });
    component.props.children[1].props.onClick();
    await new Promise(setImmediate);
    assert.deepEqual(calls, ["access"]);
  }
});

test("launch feedback commits synchronously and portals the existing boot screen outside the hero", async () => {
  let selected = null;
  const calls = [];
  const body = {};
  function BootOverlay() {}
  const useFeedback = await loadComponent("../app/game-player/useLaunchFeedback.js", {
    "./GameBootOverlay": BootOverlay,
    "react-dom": {
      flushSync(callback) { calls.push("flush start"); callback(); calls.push("flush end"); },
      createPortal(content, target) { assert.equal(target, body); return content; },
    },
  }, {
    useState: () => [selected, (value) => { selected = value; calls.push("state committed"); }],
    useEffect() {},
  }, { document: { body } });
  const initial = useFeedback();
  assert.equal(initial.overlay, null);
  initial.show(game);
  assert.deepEqual(calls, ["flush start", "state committed", "flush end"]);
  const overlay = useFeedback().overlay;
  assert.equal(overlay.props.className, "game-launch-feedback");
  assert.equal(overlay.props.children.type, BootOverlay);
  assert.equal(overlay.props.children.props.game, game);
  assert.equal(overlay.props.children.props.showBootOverlay, true);
  assert.equal(overlay.props.children.props.bootStatusText, "Loading game…");
  useFeedback().dismiss();
  assert.equal(useFeedback().overlay, null);
});
