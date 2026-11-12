import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createContext, Script } from "node:vm";
import test from "node:test";

test("catalog launches forward the native gameplay boundary once", async () => {
  const html = await readFile(new URL("../scummvm-shell/scummvm.html", import.meta.url), "utf8");
  const start = html.indexOf("if (!isLocalGame || isCatalogArchive) {\n  globalThis.__scummwebReportGameplayStarted");
  const end = html.indexOf('if (!scummwebLaunchUrl.searchParams.has("continue"))', start);
  assert.ok(start >= 0 && end > start);
  const bridge = new Script(html.slice(start, end));
  for (const [isLocalGame, isCatalogArchive, expected] of [[false, false, true], [true, true, true], [true, false, false]]) {
    const messages = [];
    let finished = 0;
    const context = createContext({ isLocalGame, isCatalogArchive, scummwebMessageSource: "scummweb", finishIntroCheckpoint: () => finished++,
      target: "nippon-amiga", buildCurrentFrameHref: () => "/scummvm.html#nippon-amiga",
      postParentMessage: (message) => messages.push(message) });
    bridge.runInContext(context);
    assert.equal(typeof context.__scummwebReportGameplayStarted === "function", expected);
    if (expected) {
      context.__scummwebReportGameplayStarted();
      assert.equal(context.__scummwebReportGameplayStarted, undefined);
      assert.equal(finished, 1);
      assert.equal(messages.length, 1);
      assert.equal(messages[0].type, "scummvm-gameplay-started");
      assert.equal(messages[0].target, "nippon-amiga");
      assert.equal(messages[0].href, "/scummvm.html#nippon-amiga");
    }
  }
});

test("a declined pointer lock request stays optional for the native canvas", async () => {
  const html = await readFile(new URL("../scummvm-shell/scummvm.html", import.meta.url), "utf8");
  const wrapper = html.match(/const requestPointerLock = canvas\.requestPointerLock;[\s\S]*?\n\}/)?.[0];
  assert.ok(wrapper);
  const error = new DOMException("The root document is not valid for pointer lock.", "WrongDocumentError");
  const request = Promise.reject(error);
  const options = { unadjustedMovement: true };
  const canvas = {
    requestPointerLock(argument) {
      assert.equal(this, canvas);
      assert.equal(argument, options);
      return request;
    },
  };
  new Script(wrapper).runInContext(createContext({ canvas }));
  assert.equal(canvas.requestPointerLock(options), request);
  await new Promise(setImmediate);
});

test("only opted-in game frames forward native compatibility warnings to the player", async () => {
  const html = await readFile(new URL("../scummvm-shell/scummvm.html", import.meta.url), "utf8");
  const bridge = new Script(html.slice(html.indexOf("const scummwebInlineFrame"), html.indexOf("const agentSaveScope")));
  const launchUrl = "https://example.test/scummvm.html?hostCompatibilityWarning=1#game";

  for (const { href, embedded, expected } of [
    { href: launchUrl, embedded: true, expected: true },
    { href: "about:srcdoc", embedded: true, expected: true },
    { href: launchUrl, embedded: false, expected: false },
    { href: "https://example.test/scummvm.html#game", embedded: true, expected: false },
    { href: launchUrl.replace("#game", "&saveQuery=1#game"), embedded: true, expected: false },
  ]) {
    const messages = [];
    const context = createContext({ URL, location: new URL(href), document: { baseURI: launchUrl } });
    context.window = context;
    context.parent = embedded ? { postMessage: (data, origin) => messages.push({ ...data, origin }) } : context;
    bridge.runInContext(context);
    if (expected) {
      context.__scummwebPostCompatibilityWarning("Édition en cours de test.\nDeuxième ligne.");
      assert.deepEqual(messages, [{
        type: "scummweb:compatibility-warning",
        href: launchUrl,
        message: "Édition en cours de test.\nDeuxième ligne.",
        origin: "https://example.test",
      }]);
    } else {
      assert.equal(context.__scummwebPostCompatibilityWarning, undefined);
    }
  }
});

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
  let config = "[scummvm]\nsavepath=/saves\n\n[dreamweb-cd]\nengineid=dreamweb\n";
  class ScummvmFS {
    constructor(fs, index) { this.FS = fs; this.index = index; }
    prefetch(name) { prefetched.push(name); return engine.promise; }
  }
  const FS = {
    readFile(name) { assert.equal(name, "/home/web_user/scummvm.ini"); return config; },
    writeFile(name, value) { assert.equal(name, "/home/web_user/scummvm.ini"); config = value; },
    mkdir() {},
    mount(filesystem, _options, name) {
      assert.match(config, /\[scummvm\]\noriginalsaveload=true\noriginal_gui=true\noriginal_menus=true\n/,
        "original screen defaults are installed before engine entry");
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
  run(html.match(/function applyGameDefaults\(iniText\) \{[\s\S]*?\n\}/)[0]);
  run(html.match(/function setupGameDefaults\(\) \{[\s\S]*?\n\}/)[0]);
  run(scripts.find((script) => script.startsWith("globalThis.SCUMMWEB_RUNTIME_ASSETS=")));
  run(scripts.find((script) => script.includes("const scummwebBrowserFsReady=")));
  run(scripts.find((script) => script.includes("const scummwebInlineFrame")));
  run(scripts.find((script) => script.includes("const originalLocateFile=")));
  await new Promise(setImmediate);
  const browserfs = appended.find(({ src }) => src.includes("browserfs.min.js"));
  const runtime = appended.find(({ src }) => src.includes("scummvm.js"));
  assert.ok(runtime, "runtime loading does not wait for BrowserFS or the engine prefetch");
  assert.match(browserfs.integrity, /^sha512-/);
  assert.equal(browserfs.scummwebPlayerAsset, "browserfs.min.js");
  assert.equal(runtime.scummwebPlayerAsset, "scummvm.js");
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
