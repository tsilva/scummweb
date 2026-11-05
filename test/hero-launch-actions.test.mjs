import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import swc from "next/dist/build/swc/index.js";

await swc.loadBindings();
let savedIdentity = null;
const saveHooks = { useState: () => [savedIdentity, () => {}], useEffect() {} };
const staticHooks = { useState: (value) => [value, () => {}], useRef: (value) => ({ current: value }), useEffect() {} };

async function loadComponent(path, imports = {}, hooks = saveHooks) {
  const url = new URL(path, import.meta.url);
  const nativeRequire = createRequire(url);
  const { code } = await swc.transform(await readFile(url, "utf8"), {
    filename: url.pathname, swcrc: false, configFile: false,
    module: { type: "commonjs" },
    jsc: { parser: { syntax: "ecmascript", jsx: true }, transform: { react: { runtime: "automatic" } } },
  });
  const compiled = { exports: {} };
  runInNewContext(code, {
    module: compiled, exports: compiled.exports,
    require(name) {
      if (name === "react") return hooks;
      if (name === "react/jsx-runtime" || name === "lucide-react") return nativeRequire(name);
      return imports[name] || {};
    },
  });
  return compiled.exports.default;
}

const LaunchButton = await loadComponent("../app/launch-button.js");
const SourceLaunchActions = await loadComponent("../app/home-shell/source-launch-actions.js");
const HeroStage = await loadComponent("../app/home-shell/hero-stage.js", {
  "../launch-button": LaunchButton,
  "./source-launch-actions": SourceLaunchActions,
  "./decorative-image": () => null,
  "./shell-icon": () => null,
  "./hero-title": ({ children }) => children,
  "./hero-images.mjs": { getHeroImageProps: () => ({}) },
  "./hero-title-fit.mjs": { fitHeroTitle() {} },
  "./shared": { getGameDialogId: () => "game-test", getHeroImageStyle: () => ({}) },
});
const HomeHero = await loadComponent("../app/home-shell/home-hero.js", {
  "./hero-stage": HeroStage,
  "./hero-images.mjs": { getHeroPreloadImages: () => [] },
  "../game-versions.mjs": { getGameFamilyKey: (game) => game.target },
}, staticHooks);
const game = { target: "sky", displayTitle: "Beneath a Steel Sky", playHref: "/beneath-a-steel-sky/play" };

function slideFor(versions) {
  return HomeHero({ featuredGame: game, groups: [{ key: game.target, title: game.displayTitle,
    game, dialogId: "game-test", versions }] });
}

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
  const version = { key: "source:zip", source: { id: "zip" }, game,
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
  const version = { key: "source:zip", source: { id: "zip" }, game,
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

test("multiple versions keep the slideshow's version chooser", () => {
  savedIdentity = "sky";
  const slide = slideFor([{ key: "catalog:sky", game }, { key: "source:zip", game, source: { id: "zip" } }]);
  assert.equal(slide.props.sourceVersion, undefined);
  const html = renderToStaticMarkup(slide);
  assert.match(html, /aria-controls="game-test"/);
  assert.doesNotMatch(html, />Continue|#continue/);
});
