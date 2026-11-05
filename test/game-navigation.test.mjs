import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import test from "node:test";
import swc from "next/dist/build/swc/index.js";
import * as selection from "../app/home-shell/hero-selection.mjs";
import * as versions from "../app/game-versions.mjs";
import { libraryItems } from "../app/home-shell/library-query.mjs";
import * as seo from "../lib/seo.mjs";

await swc.loadBindings();
async function component(file, imports, globals = {}) {
  const url = new URL(`../app/home-shell/${file}.js`, import.meta.url);
  const { code } = await swc.transform(await readFile(url, "utf8"), {
    filename: url.pathname, swcrc: false, configFile: false, module: { type: "commonjs" },
    jsc: { parser: { syntax: "ecmascript", jsx: true }, transform: { react: { runtime: "automatic" } } },
  });
  const module = { exports: {} };
  runInNewContext(code, {
    ...globals, module, exports: module.exports, URL,
    require(name) {
      if (name === "react/jsx-runtime") return createRequire(url)(name);
      return imports[name] ?? {};
    },
  });
  return module.exports.default;
}

const sky = { target: "sky", gameId: "sky", engineId: "sky", href: "/beneath-a-steel-sky", displayTitle: "Beneath a Steel Sky" };
const queen = { target: "queen", gameId: "queen", engineId: "queen", href: "/flight-of-the-amazon-queen", displayTitle: "Flight of the Amazon Queen" };

async function library() {
  const catalog = [sky, queen];
  const imported = { source: { id: "custom", name: "My game.zip", kind: "zip" }, status: "available", game: { displayTitle: "My game" } };
  const hooks = [], effects = [], listeners = new Map(), history = [];
  const window = {
    location: new URL("https://example.test/"),
    history: { pushState(data, title, href) { history.push(href); window.location = new URL(href, window.location); } },
    addEventListener: (name, handler) => listeners.set(name, handler),
    removeEventListener: (name) => listeners.delete(name),
  };
  let cursor = 0;
  function state(initial) {
    const index = cursor++;
    if (!(index in hooks)) hooks[index] = typeof initial === "function" ? initial() : initial;
    return [hooks[index], (next) => { hooks[index] = typeof next === "function" ? next(hooks[index]) : next; }];
  }
  function Hero() {}
  function View() {}
  const SourceLibrary = await component("source-library", {
    react: { useState: state, useRef: (current) => state({ current })[0], useMemo: (fn) => fn(), useEffect: (fn) => effects.push(fn) },
    "next/navigation": { usePathname: () => window.location.pathname, useRouter: () => ({ push() { assert.fail("selection must not fetch a Next.js route"); } }) },
    "../recognized-games.mjs": { getRecognizedGames: () => catalog },
    "../game-presentation": { getImportedGamePresentation: () => imported.game, getGamePresentation: (game) => game },
    "../game-sources.mjs": { isLocalZipSource: () => true },
    "../game-versions.mjs": versions,
    "./hero-selection.mjs": selection,
    "./library-query.mjs": { libraryItems },
    "./home-hero": Hero,
    "./library-view": View,
    "./game-navigation": { GameNavigationContext: "provider" },
  }, { window });
  // Preserve an already-restored imported source in the mounted library.
  hooks[0] = [imported];
  function render() {
    cursor = 0;
    const tree = SourceLibrary({ catalog, featuredGame: sky, isHomePage: true });
    const children = tree.props.children.filter(Boolean);
    return {
      select: tree.props.value,
      hero: children.find((child) => child.type === Hero),
      view: children.at(-1).props.children.find((child) => child.type === View),
    };
  }
  render();
  const cleanup = effects[0]();
  return { render, history, cleanup, listeners,
    restore(href) { window.location = new URL(href, window.location); listeners.get("popstate")(); return render(); },
  };
}

test("game navigation updates the mounted library and restores Back/Forward selections", async () => {
  const app = await library();
  assert.equal(app.render().select(queen), true);
  let view = app.render();
  assert.equal(view.hero.props.featuredGame, queen);
  assert.equal(view.hero.props.isHomePage, false);
  assert.equal(view.view.props.selectedKey, versions.getGameFamilyKey(queen));
  assert.ok(view.view.props.items.some(({ key }) => key === "source:custom"), "imports survive selection");
  assert.equal(view.select(queen), true);
  assert.deepEqual(app.history, [queen.href], "reselecting does not add duplicate history entries");
  view = app.restore("/");
  assert.equal(view.hero.props.isHomePage, true);
  assert.equal(view.view.props.selectedKey, null);
  view = app.restore(queen.href);
  assert.equal(view.hero.props.featuredGame, queen);
  assert.equal(view.select({ href: "/compatibility" }), false, "unrelated routes use normal navigation");
  app.cleanup();
  assert.equal(app.listeners.size, 0);
});

test("same-page imported selections update immediately and clear when history returns home", async () => {
  const app = await library();
  const imported = app.render().view.props.items.find(({ key }) => key === "source:custom");
  assert.equal(app.render().select(imported.game), true);
  assert.equal(app.render().view.props.selectedKey, "source:custom");
  assert.deepEqual(app.history, ["/#slide=source%3Acustom"]);
  assert.equal(app.restore("/").view.props.selectedKey, null);
  assert.equal(app.restore("/#slide=source%3Acustom").view.props.selectedKey, "source:custom");
  app.cleanup();
});

test("selection links cancel route fetching only when the current library handles the game", async () => {
  let select = () => true, prevented = false;
  const Link = await component("game-selection-link", {
    "next/link": "a",
    "./hero-selection.mjs": selection,
    "./game-navigation": { useGameNavigation: () => select },
  }, { window: { scrollTo() {} } });
  const event = { preventDefault() { prevented = true; } };
  let link = Link({ game: queen, children: "Queen" });
  assert.equal(link.props.href, queen.href, "native and new-tab links retain the canonical route");
  assert.equal(link.props.prefetch, false);
  link.props.onNavigate(event);
  assert.equal(prevented, true);
  select = null;
  prevented = false;
  link = Link({ game: queen });
  link.props.onNavigate(event);
  assert.equal(prevented, false, "links outside a library retain Next.js navigation");
});

test("a mounted hero resets to the requested game after automatic rotation or reselecting its route", async () => {
  const hooks = [], selections = [];
  let cursor = 0;
  const Hero = await component("home-hero", {
    react: {
      useState(initial) {
        const index = cursor++;
        if (!(index in hooks)) hooks[index] = initial;
        return [hooks[index], (value) => { hooks[index] = value; }];
      },
      useEffect() {}, useRef: (current) => ({ current }),
    },
    "next/navigation": { useRouter: () => ({ push() { assert.fail("arrow must use local selection"); } }) },
    "lucide-react": { ChevronLeft: "left", ChevronRight: "right", Play: "play", Pause: "pause" },
    "../game-versions.mjs": versions,
    "./hero-selection.mjs": selection,
    "./hero-images.mjs": { getHeroPreloadImages: () => [] },
    "./game-navigation": { useGameNavigation: () => (game) => { selections.push(game); return true; } },
  }, { window: { scrollTo() {} } });
  const groups = libraryItems([sky, queen], []);
  function render(featuredGame, navigationId) {
    cursor = 0;
    return Hero({ groups, featuredGame, navigationId, isHomePage: false });
  }
  let hero = render(sky, 0);
  hero.props.controls.props.children[2].props.onClick();
  assert.equal(selections[0].target, queen.target);
  hero = render(queen, 1);
  assert.equal(hero.props.featuredGame.target, queen.target);
  const rotation = hero.props.controls.props.children[3];
  assert.equal(rotation.props["aria-label"], "Resume slideshow");
  rotation.props.children[0].props.children[1].props.onAnimationEnd();
  assert.equal(render(queen, 1).props.featuredGame.target, sky.target, "automatic rotation remains local");
  assert.equal(render(queen, 2).props.featuredGame.target, queen.target, "reselecting restores the route's game without remounting");
});

test("mobile hero stays static, changes on reload, and honors direct routes and hash selections", async () => {
  const groups = libraryItems([sky, queen], []);
  const storage = new Map();
  async function mount({ isHomePage = true, hash = "", stored = storage } = {}) {
    const hooks = [], refs = [], effects = [];
    let cursor = 0, refCursor = 0;
    const Hero = await component("home-hero", {
      react: {
        useState(initial) {
          const index = cursor++;
          if (!(index in hooks)) hooks[index] = initial;
          return [hooks[index], (value) => { hooks[index] = value; }];
        },
        useEffect: (effect) => effects.push(effect),
        useRef(current) { return refs[refCursor++] ??= { current }; },
      },
      "next/navigation": { useRouter: () => ({ push() { assert.fail("initial selection must not navigate"); } }) },
      "lucide-react": { ChevronLeft: "left", ChevronRight: "right", Play: "play", Pause: "pause" },
      "../game-versions.mjs": versions,
      "./hero-selection.mjs": selection,
      "./hero-images.mjs": { getHeroPreloadImages: () => [] },
      "./game-navigation": { useGameNavigation: () => null },
    }, {
      Math: { random: () => 0, max: Math.max },
      window: { location: { hash }, matchMedia: () => ({ matches: true, addEventListener() {}, removeEventListener() {} }) },
      sessionStorage: { getItem: (key) => stored.get(key), setItem: (key, value) => stored.set(key, value) },
    });
    function render() {
      cursor = 0; refCursor = 0;
      return Hero({ groups, featuredGame: sky, isHomePage });
    }
    render();
    const cleanup = effects[1]();
    // Strict Mode replay must not choose twice on a single load.
    cleanup(); effects[1]();
    return { render, get result() { return render(); } };
  }
  const first = await mount();
  const firstId = first.result.props.featuredGame.target;
  assert.equal(first.result.props.isMobile, true);
  assert.equal(first.result.props.controls, null);
  assert.equal(first.result.props.carouselProps, undefined);
  assert.equal(first.result.props.featuredGame.target, firstId, "restoring sources does not change the pick");
  const reloaded = await mount();
  assert.notEqual(reloaded.result.props.featuredGame.target, firstId);
  assert.equal((await mount({ isHomePage: false })).result.props.featuredGame.target, sky.target);
  assert.equal((await mount({ hash: `#slide=${encodeURIComponent(groups[0].key)}` })).result.props.featuredGame.target, sky.target);
  const blocked = { get() { throw new Error("Storage disabled"); }, set() { throw new Error("Storage disabled"); } };
  assert.equal((await mount({ stored: blocked })).result.props.isMobile, true);
});

test("local game changes and history restoration keep metadata and structured data aligned", async () => {
  const values = new Map();
  const names = ["description", "og:title", "og:description", "og:url", "og:image", "og:image:alt", "twitter:title", "twitter:description", "twitter:image", "twitter:image:alt"];
  const document = {
    title: "",
    querySelector: () => ({ setAttribute: (_name, value) => values.set("canonical", value) }),
    head: { querySelectorAll: () => names.map((name) => ({
      getAttribute: () => name,
      setAttribute: (_attribute, value) => values.set(name, value),
    })) },
  };
  const Metadata = await component("browse-metadata", {
    react: { useEffect: (run) => run() }, "../seo": seo, "../seo-json-ld": "script",
  }, { document });
  const game = { ...sky, summary: "Explore a dystopian future.", year: "1994", genre: "Adventure" };
  const catalog = [game];
  for (const isHomePage of [true, false, true]) {
    const rendered = Metadata({ game, catalog, isHomePage });
    const expected = isHomePage ? seo.buildHomeMetadata() : seo.buildGameMetadata(game);
    assert.equal(document.title, expected.title);
    assert.equal(values.get("canonical"), expected.alternates.canonical);
    assert.equal(values.get("description"), expected.description);
    assert.equal(values.get("og:url"), expected.openGraph.url);
    assert.equal(values.get("twitter:image"), expected.twitter.images[0].url);
    assert.deepEqual(rendered.props.data, isHomePage ? seo.buildHomeStructuredData(catalog) : seo.buildGameStructuredData(game));
  }
});
