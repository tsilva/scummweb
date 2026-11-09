import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import swc from "next/dist/build/swc/index.js";
import compatibility from "../data/game-compatibility.json" with { type: "json" };
import library from "../scummvm-shell/games.json" with { type: "json" };
import { getBundledGameLibrary } from "../lib/catalog.mjs";
import { buildCompatibilityPageEntries } from "../lib/game-compatibility.mjs";
import { getRecognizedGames } from "../app/recognized-games.mjs";

const games = getRecognizedGames(getBundledGameLibrary(library).games);
const entries = buildCompatibilityPageEntries(compatibility.entries, games);

test("compatibility links cover every recognized game without changing recorded evidence", () => {
  assert.deepEqual(new Set(entries.filter((entry) => entry.href).map((entry) => entry.href)), new Set(games.map((game) => game.href)));
  for (const [index, entry] of compatibility.entries.entries()) {
    const { href, ...record } = entries[index];
    assert.deepEqual(record, entry);
  }
  assert.equal(entries.find((entry) => entry.href === "/the-secret-of-monkey-island-demo").status, "not-tested");
  assert.equal(entries.find((entry) => entry.href === "/the-secret-of-monkey-island").status, "startup-verified");
});

test("matching keeps engine identities and editions separate and does not fabricate ratings", () => {
  const games = [
    { familyId: "agi:pq1", displayTitle: "Police Quest", href: "/original" },
    { familyId: "sci:pq1sci", displayTitle: "Police Quest", href: "/remake" },
    { familyId: "scumm:monkey", displayTitle: "Monkey (Demo)", href: "/demo" },
  ];
  const source = [
    { gameId: "agi:pq1", title: "Police Quest", status: "startup-verified", edition: "Amiga.zip" },
    { gameId: "agi:pq1", title: "Police Quest", status: "startup-warning", edition: "DOS.zip" },
    { gameId: "sci:pq1sci", title: "Police Quest", status: "not-tested", upstreamRating: "Good" },
    { gameId: "scumm:monkey", title: "Monkey", status: "startup-verified", edition: "CD.zip" },
  ];
  const result = buildCompatibilityPageEntries(source, games);
  assert.deepEqual(result.slice(0, 4).map((entry) => entry.href), ["/original", "/original", "/remake", undefined]);
  assert.equal(result[4].href, "/demo");
  assert.equal(result[4].status, "not-tested");
  assert.equal(result[4].upstreamRating, undefined);
});

const componentUrl = new URL("../app/compatibility/compatibility-view.js", import.meta.url);
await swc.loadBindings();
const { code } = await swc.transform(await readFile(componentUrl, "utf8"), {
  filename: componentUrl.pathname, swcrc: false, configFile: false,
  module: { type: "commonjs" },
  jsc: { parser: { syntax: "ecmascript", jsx: true }, transform: { react: { runtime: "automatic" } } },
});
const compiled = { exports: {} };
const requireView = createRequire(componentUrl);
runInNewContext(code, { module: compiled, exports: compiled.exports, require(name) {
  if (name === "../styles/compatibility.css") return {};
  return requireView(name);
} });

test("initial compatibility HTML contains every game link before any interaction", () => {
  const html = renderToStaticMarkup(createElement(compiled.exports.default, {
    entries, recordedOn: compatibility.recordedOn, upstreamReference: compatibility.upstreamReference, standalone: true,
  }));
  assert.match(html, /<h1 id="compatibility-page-title">Game compatibility<\/h1>/);
  for (const game of games) assert.ok(html.includes(`href="${game.href}"`), game.displayTitle);
  assert.match(html, /Search game compatibility/);
  assert.match(html, /Not yet tested/);
});

test("compatibility page supplies the catalog needed by saved-game settings", async () => {
  const pageUrl = new URL("../app/compatibility/page.js", import.meta.url);
  const { code } = await swc.transform(await readFile(pageUrl, "utf8"), {
    filename: pageUrl.pathname, swcrc: false, configFile: false,
    module: { type: "commonjs" },
    jsc: { parser: { syntax: "ecmascript", jsx: true }, transform: { react: { runtime: "automatic" } } },
  });
  const page = { exports: {} };
  const catalog = [{ target: "sky", displayTitle: "Beneath a Steel Sky" }];
  const require = createRequire(pageUrl);
  runInNewContext(code, { module: page, exports: page.exports, require(name) {
    if (name.endsWith("/game-page-data")) return { getHomeShellData: () => ({ catalog }) };
    if (name.endsWith("/game-library")) return { getRecognizedGameLibrary: () => games, getVersionedSiteAssetPath: (path) => path };
    if (name.endsWith("/home-shell")) return { default: function HomeShell() {} };
    if (name === "./compatibility-view") return {};
    return require(name);
  } });
  assert.equal(page.exports.default().props.catalog, catalog);
});
