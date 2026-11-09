import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import swc from "next/dist/build/swc/index.js";

const componentUrl = new URL("../app/home-shell/source-launch-actions.js", import.meta.url);
await swc.loadBindings();
const { code } = await swc.transform(await readFile(componentUrl, "utf8"), {
  filename: componentUrl.pathname, swcrc: false, configFile: false,
  module: { type: "commonjs" },
  jsc: { parser: { syntax: "ecmascript", jsx: true }, transform: { react: { runtime: "automatic" } } },
});
const nativeRequire = createRequire(componentUrl);
let savedVersion = null;
const compiled = { exports: {} };
runInNewContext(code, {
  module: compiled, exports: compiled.exports,
  require(name) {
    if (name === "../use-browser-save") return () => savedVersion === null ? null : 0;
    if (name === "../game-player/useLaunchFeedback") return () => ({ show() {}, dismiss() {}, overlay: null });
    if (name === "../game-player/immersive-mode.mjs") return { beginGameLaunch: () => false };
    if (name === "../browser-saves.mjs") return { cancelBrowserSaveQueries() {} };
    if (name === "react/jsx-runtime" || name === "lucide-react") return nativeRequire(name);
    return {};
  },
});
const SourceLaunchActions = compiled.exports.default;

test("access approval replaces both Play and Continue until granted", () => {
  const clicks = [];
  const version = { key: "zip", game: {}, action: {
    needsAccess: true, onClick: () => clicks.push("access"), onContinue: () => clicks.push("continue"),
  } };
  savedVersion = "zip";
  const view = SourceLaunchActions({ version, onLaunch() {} });
  const html = renderToStaticMarkup(view);
  assert.match(html, /Allow file access<\/button>/);
  assert.match(html, /then allow access in the browser prompt/);
  assert.match(html, /aria-describedby="game-file-access-help"/);
  assert.doesNotMatch(html, /Continue|Start from beginning/);
  view.props.children[1].props.onClick();
  assert.deepEqual(clicks, ["access"]);

  version.action.needsAccess = false;
  const ready = SourceLaunchActions({ version, onLaunch() {} });
  assert.match(renderToStaticMarkup(ready), /Continue<\/button>/);
  ready.props.children[1].props.onClick();
  assert.deepEqual(clicks, ["access", "continue"]);
  savedVersion = null;
  assert.match(renderToStaticMarkup(SourceLaunchActions({ version, onLaunch() {} })), /Play<\/button>/);
});
