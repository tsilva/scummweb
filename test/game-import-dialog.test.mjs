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
const { GameImportItems } = compiled.exports;

test("directory progress renders each waiting, active, completed, and skipped file", () => {
  const html = renderToStaticMarkup(createElement(GameImportItems, {
    showProgress: true,
    items: [{ label: "Collection", message: "Checking ZIP 3 of 4…", value: 2, total: 4, files: [
      { label: "DOS/game.zip", message: "Added to your library", complete: true },
      { label: "bad.zip", message: "Unreadable ZIP", skipped: true },
      { label: "Amiga/game.zip", message: "Checking ZIP…" },
      { label: "next.zip", message: "Waiting…" },
    ] }],
  }));
  for (const label of ["DOS/game.zip", "bad.zip", "Amiga/game.zip", "next.zip"]) {
    assert.ok(html.includes(`<strong>${label}</strong>`), label);
  }
  for (const status of ["Added to your library", "Skipped. Unreadable ZIP", "Checking ZIP…", "Waiting…"]) {
    assert.ok(html.includes(status), status);
  }
  assert.equal((html.match(/<progress /g) ?? []).length, 1);
});

test("progress follows the active directory and final results retain loose file rows", () => {
  const items = [
    { label: "First", message: "Added to your library", complete: true },
    { label: "Second", message: "Checking game files…", files: [
      { label: "data/vol.cat", message: "File checked", complete: true },
      { label: "data/vol.dat", message: "Reading file…" },
    ] },
  ];
  const progress = renderToStaticMarkup(createElement(GameImportItems, { items, showProgress: true }));
  assert.ok(progress.includes('aria-label="Importing Second"'));
  assert.ok(!progress.includes('aria-label="Importing First"'));
  const result = renderToStaticMarkup(createElement(GameImportItems, { items, complete: true }));
  assert.ok(result.includes("data/vol.cat"));
  assert.ok(result.includes("data/vol.dat"));
  assert.ok(!result.includes("<progress"));
});
