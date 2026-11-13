import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { BlobWriter, Uint8ArrayReader, ZipWriter } from "@zip.js/zip.js";
import swc from "next/dist/build/swc/index.js";
import * as imports from "../app/local-game-import.mjs";
import { gameIso } from "./helpers/game-iso.mjs";

const url = new URL("../app/home-shell/local-game.js", import.meta.url);
await swc.loadBindings();
const { code } = await swc.transform(await readFile(url, "utf8"), {
  filename: url.pathname, swcrc: false, configFile: false, module: { type: "commonjs" },
  jsc: { parser: { syntax: "ecmascript", jsx: true }, transform: { react: { runtime: "automatic" } } },
});

function overlay(disabled = false) {
  const listeners = new Map(), states = [], effects = [], batches = [];
  let cursor = 0;
  const module = { exports: {} }, require = createRequire(url);
  runInNewContext(code, { module, exports: module.exports, document: { body: {} },
    window: {
      addEventListener: (name, handler) => listeners.set(name, handler),
      removeEventListener: (name) => listeners.delete(name),
    },
    require(name) {
      if (name === "../game-import-nodes.mjs") return imports;
      if (name === "react-dom") return { createPortal: (element) => element };
      if (name === "react") return {
        useState(initial) {
          const index = cursor++;
          if (!(index in states)) states[index] = initial;
          return [states[index], (value) => { states[index] = value; }];
        },
        useRef: (current) => ({ current }), useEffect: (effect) => effects.push(effect),
      };
      return require(name);
    },
  });
  const props = { disabled, pending: [], importRoots: (roots) => batches.push(
    imports.collectGameImportNodes(roots).then((nodes) => Promise.all(nodes.map(imports.prepareLocalArchive)))
  ) };
  const render = () => { cursor = 0; return module.exports.default(props); };
  render();
  const cleanup = effects[0]();
  return { render, cleanup, batches, listeners, dispatch(name, dataTransfer) {
    const event = { dataTransfer, prevented: false, preventDefault() { this.prevented = true; } };
    listeners.get(name)(event);
    return event;
  } };
}

test("the drop UX accepts mixed ISO/ZIP files with empty MIME types and advertises both formats", async () => {
  const zip = new ZipWriter(new BlobWriter());
  await zip.add("vol.cat", new Uint8ArrayReader(Uint8Array.of(1, 2)));
  const files = [new File([gameIso()], "Disc.ISO"), new File([await zip.close()], "Game.zip")];
  const app = overlay();
  // External drags announce Files; ISO MIME types are often blank or generic.
  const transfer = { types: ["Files"], items: files.map((file) => ({ kind: "file", type: "", getAsFile: () => file })), files };
  assert.equal(app.dispatch("dragenter", transfer).prevented, true);
  assert.equal(transfer.dropEffect, "copy");
  assert.match(renderToStaticMarkup(app.render()), /ZIPs, ISOs, or folders/);
  assert.equal(app.dispatch("drop", transfer).prevented, true);
  assert.equal(app.render(), null, "the drop clears the overlay");
  const games = await app.batches[0];
  assert.deepEqual(games.map(({ kind }) => kind), ["iso", "zip"]);
  assert.deepEqual(games[0].archiveFiles, [["VOL.CAT", 9, 0xcbf43926]]);
  app.cleanup();
  assert.equal(app.listeners.size, 0);
});

test("folder drops reach ISO files through native handles and legacy directory batches", async () => {
  const file = new File([gameIso()], "Nested.ISO");
  const handle = { kind: "file", name: file.name, getFile: async () => file };
  const native = { kind: "directory", name: "Collection", async *values() {
    yield { kind: "file", name: "notes.txt" };
    yield { kind: "directory", name: "Nested", async *values() { yield handle; } };
  } };
  const legacy = { isDirectory: true, name: "Collection", createReader() {
    let batch = 0;
    return { readEntries: (success) => success(batch++ ? [] : [
      { isFile: true, name: file.name, file: (success) => success(file) },
      { isFile: true, name: "notes.txt" },
    ]) };
  } };
  for (const item of [
    { getAsFileSystemHandle: async () => native },
    { getAsFileSystemHandle: async () => { throw new Error("Unsupported"); }, webkitGetAsEntry: () => legacy },
  ]) {
    const app = overlay();
    app.dispatch("drop", { types: ["Files"], items: [{ kind: "file", getAsFile: () => null, ...item }], files: [] });
    const [game] = await app.batches[0];
    assert.equal(game.kind, "iso");
    assert.equal(game.name, file.name);
    app.cleanup();
  }
});

test("file-list-only drops import ISO files, while text and disabled drops do not import", async () => {
  const file = new File([gameIso()], "Disc.iso");
  const transfer = { types: ["Files"], items: [], files: [file] };
  const app = overlay();
  assert.equal(app.dispatch("drop", { types: ["text/plain"] }).prevented, false);
  assert.equal(app.batches.length, 0);
  app.dispatch("drop", transfer);
  assert.equal((await app.batches[0])[0].kind, "iso");
  app.cleanup();
  const busy = overlay(true);
  busy.dispatch("dragenter", transfer);
  assert.equal(transfer.dropEffect, "none");
  assert.equal(busy.render(), null);
  busy.dispatch("drop", transfer);
  assert.equal(busy.batches.length, 0);
  busy.cleanup();
});
