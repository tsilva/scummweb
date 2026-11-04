import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import test from "node:test";
import swc from "next/dist/build/swc/index.js";

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
