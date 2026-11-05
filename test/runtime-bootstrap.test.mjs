import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createContext, Script } from "node:vm";
import test from "node:test";

test("generated shell overlaps engine, storage and runtime loading and mounts only after all inputs are ready", async () => {
  const html = await readFile(new URL("../scummvm-shell/scummvm.html", import.meta.url), "utf8");
  const scripts = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)].map((match) => match[1]);
  for (const script of scripts) new Script(script); // Check every generated inline script, including the fingerprint map.
  const engine = Promise.withResolvers();
  const files = Promise.withResolvers();
  const appended = [];
  const prefetched = [];
  const mounts = [];
  const dependencies = new Set();
  class ScummvmFS {
    constructor(fs, index) { this.FS = fs; this.index = index; }
    prefetch(name) { prefetched.push(name); return engine.promise; }
  }
  const FS = {
    mkdir() {},
    mount(filesystem, _options, name) {
      assert.equal(filesystem.FS, FS, "late binding uses the initialized Emscripten filesystem");
      mounts.push(name);
    },
  };
  const context = createContext({
    URL, URLSearchParams, Promise, FS, Module: {},
    location: new URL("https://example.test/scummvm.html?localGame=1&engine=dreamweb&catalogGame=dreamweb&v=sha-shell#dreamweb-cd"),
    parent: {}, performance: { mark() {} },
    document: {
      baseURI: "https://example.test/scummvm.html?v=sha-shell",
      createElement: () => ({}),
      head: { appendChild: (script) => appended.push(script) },
      body: { appendChild: (script) => appended.push(script) },
    },
    loadModule: async (url) => String(url).includes("audio-start-control") ? { installAudioStartControl() {} } : {
      LocalGameFS: class {}, ScummvmFS, loadFilesystemIndex: async () => ({ url: "/data", json: {} }),
    },
    isLocalGame: true, isCatalogArchive: true, defaultSavePath: "/saves",
    ensureDirectory() {}, setupLocalGame: () => files.promise,
    installMissingCatalogTarget: async () => {}, setupSkipIntroSaves: async () => {},
    addRunDependency: (name) => dependencies.add(name),
    removeRunDependency: (name) => dependencies.delete(name),
  });
  context.window = context;
  function run(script) { return new Script(script.replace(/\bimport\(/g, "loadModule(")).runInContext(context); }
  run(scripts.find((script) => script.startsWith("globalThis.SCUMMWEB_RUNTIME_ASSETS=")));
  run(scripts.find((script) => script.includes("const scummwebBrowserFsReady=")));
  run(scripts.find((script) => script.includes("const scummwebInlineFrame")));
  run(scripts.find((script) => script.includes("const originalLocateFile=")));
  await new Promise(setImmediate);
  const browserfs = appended.find(({ src }) => src.includes("browserfs.min.js"));
  const runtime = appended.find(({ src }) => src.includes("scummvm.js"));
  assert.ok(runtime, "runtime loading does not wait for BrowserFS or the engine prefetch");
  assert.match(browserfs.integrity, /^sha512-/);
  assert.equal(runtime.src, `https://example.test/scummvm.js?v=${context.SCUMMWEB_RUNTIME_ASSETS["/scummvm.js"]}`);
  assert.deepEqual(prefetched, ["/translations.dat", "/shaders.dat", "/scummmodern.zip", "/helpdialog.zip",
    "/residualvm.zip", "/scummremastered.zip", "/wintermute.zip", "/scummclassic.zip", "/plugins/libdreamweb.so"]);
  context.setupLocalFilesystem = () => run("scummwebBrowserFsReady");
  const setup = html.match(/function setupFilesystem\(\) \{[\s\S]*?\n\}var Module=/)[0].replace(/var Module=$/, "");
  run(setup);
  run("setupFilesystem()");
  assert.equal(dependencies.size, 1);
  assert.deepEqual(mounts, []);
  browserfs.onload();
  engine.resolve(true);
  await new Promise(setImmediate);
  assert.deepEqual(mounts, [], "archive handoff still gates engine entry");
  files.resolve();
  await new Promise(setImmediate);
  assert.deepEqual(mounts, ["/data/"]);
  assert.equal(dependencies.size, 0);
});
