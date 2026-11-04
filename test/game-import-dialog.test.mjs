import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import swc from "next/dist/build/swc/index.js";

// Compile the real JSX list with the same compiler used by the application.
const componentUrl = new URL("../app/home-shell/local-game.js", import.meta.url);
await swc.loadBindings();
const { code } = await swc.transform(await readFile(componentUrl, "utf8"), {
  filename: componentUrl.pathname,
  swcrc: false,
  configFile: false,
  module: { type: "commonjs" },
  jsc: { parser: { syntax: "ecmascript", jsx: true }, transform: { react: { runtime: "automatic" } } },
});
const compiled = { exports: {} };
runInNewContext(code, { module: compiled, exports: compiled.exports, require: createRequire(componentUrl) });
const { GameImportDialog, GameImportItems } = compiled.exports;

test("directory progress renders waiting, active, added, and failed files while hiding skipped files", () => {
  const html = renderToStaticMarkup(createElement(GameImportItems, {
    showProgress: true,
    items: [{ label: "Collection", message: "Checking ZIP 4 of 5…", value: 3, total: 5, files: [
      { label: "DOS/game.zip", message: "Added to your library", status: "added", complete: true },
      { label: "old.zip", message: "Already in your library. Files refreshed.", status: "skipped" },
      { label: "bad.zip", message: "Unreadable ZIP", status: "error" },
      { label: "Amiga/game.zip", message: "Checking ZIP…" },
      { label: "next.zip", message: "Waiting…" },
    ] }],
  }));
  for (const label of ["DOS/game.zip", "bad.zip", "Amiga/game.zip", "next.zip"]) {
    assert.ok(html.includes(`<strong>${label}</strong>`), label);
  }
  assert.ok(!html.includes("old.zip"));
  for (const status of ["Added to your library", "Error. Unreadable ZIP", "Checking ZIP…", "Waiting…"]) {
    assert.ok(html.includes(status), status);
  }
  assert.ok(!html.includes("<progress"));
  assert.ok(!html.includes("<strong>Collection</strong>"));
});

test("batch totals include every outcome without counting a folder's data files as games", () => {
  const result = {
    items: [
      { label: "New folder", status: "added", message: "Added to your library", files: [
        { label: "game.000", status: "added", message: "Added with game folder" },
        { label: "game.001", status: "added", message: "Added with game folder" },
      ] },
      { label: "Existing.zip", status: "skipped", message: "Already in your library. Files refreshed." },
      { label: "Broken.zip", status: "error", message: "Unreadable ZIP" },
    ],
  };
  const html = renderToStaticMarkup(createElement(GameImportDialog, { pending: [], result }));
  assert.ok(html.includes('<h2 id="game-import-title">3 games scanned</h2>'));
  assert.ok(html.includes('1 game added · 1 game skipped · 1 error'));
  assert.ok(html.includes('class="game-import-confirm"'));
  assert.ok(!html.includes("Existing.zip"));
  assert.ok(!html.includes("lucide-circle-minus"));
  for (const [icon, colorClass] of [["circle-check", "success"], ["circle-x", "error"]]) {
    assert.match(html, new RegExp(`class="[^"]*lucide-${icon}[^"]*game-import-${colorClass}`));
  }
});

test("reimporting a library reports scanned and skipped counts", () => {
  const result = { items: Array.from({ length: 168 }, (_, index) => ({
    label: `Game ${index}.zip`, status: "skipped", message: "Already in your library. Files refreshed.",
  })) };
  const html = renderToStaticMarkup(createElement(GameImportDialog, { pending: [], result }));
  assert.ok(html.includes('<h2 id="game-import-title">168 games scanned</h2>'));
  assert.ok(html.includes('0 games added · 168 games skipped · 0 errors'));
  assert.ok(!html.includes("<li"));
  assert.ok(html.includes('class="game-import-confirm"'));
});

test("a single failed scan reports an error rather than a skipped game", () => {
  const result = { items: [{ label: "bad.zip", status: "error", message: "Unreadable ZIP" }] };
  const html = renderToStaticMarkup(createElement(GameImportDialog, { pending: [], result }));
  assert.ok(html.includes('<h2 id="game-import-title">1 game scanned</h2>'));
  assert.ok(html.includes('0 games added · 0 games skipped · 1 error'));
  assert.ok(html.includes('Error. Unreadable ZIP'));
});

test("progress follows the active directory and final results retain loose file rows", () => {
  const items = [
    { label: "First", message: "Added to your library", complete: true },
    { label: "Second", message: "Checking game files…", files: [
      { label: "data/vol.cat", message: "File checked", complete: true },
      { label: "data/vol.dat", message: "Reading file…" },
    ] },
  ];
  items[1].value = 1;
  items[1].total = 2;
  const progress = renderToStaticMarkup(createElement(GameImportDialog, { pending: items }));
  assert.ok(progress.includes('aria-label="Importing games" value="1" max="2"'));
  assert.equal((progress.match(/<progress /g) ?? []).length, 1);
  assert.ok(progress.indexOf("<progress") < progress.indexOf('class="game-import-details"'));
  assert.ok(!progress.includes("Checking files on this device."));
  assert.ok(!progress.includes("<strong>Second</strong>"));
  const result = renderToStaticMarkup(createElement(GameImportItems, { items, complete: true }));
  assert.ok(result.includes("data/vol.cat"));
  assert.ok(result.includes("data/vol.dat"));
  assert.ok(!result.includes("<progress"));
});

test("progress advances past added, skipped, and failed items", () => {
  const html = renderToStaticMarkup(createElement(GameImportDialog, {
    pending: [
      { label: "added.zip", status: "added", message: "Added to your library" },
      { label: "old.zip", status: "skipped", message: "Already in your library. Files refreshed." },
      { label: "bad.zip", status: "error", message: "Unreadable ZIP" },
      { label: "active.zip", message: "Checking ZIP…", value: 2, total: 3 },
    ],
  }));
  assert.equal((html.match(/<progress /g) ?? []).length, 1);
  assert.ok(html.includes('aria-label="Importing games" value="2" max="3"'));
});

test("latest scanned rows lead a flat list across folders and precede waiting files", () => {
  const items = [
    { label: "First collection", files: [
      { label: "first.zip", status: "added", scanOrder: 2 },
      { label: "failed.zip", status: "error", scanOrder: 4 },
    ] },
    { label: "Second collection", files: [
      { label: "active.zip", message: "Checking ZIP…", scanOrder: 5 },
      { label: "waiting.zip", message: "Waiting…" },
    ] },
  ];
  const html = renderToStaticMarkup(createElement(GameImportItems, { items, showProgress: true }));
  const labels = [...html.matchAll(/<strong>(.*?)<\/strong>/g)].map((match) => match[1]);
  assert.deepEqual(labels, ["active.zip", "failed.zip", "first.zip", "waiting.zip"]);
  assert.equal((html.match(/<ul /g) ?? []).length, 1);
  assert.equal(items[0].files[0].label, "first.zip");
});
