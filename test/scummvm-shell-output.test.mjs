import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import vm from "node:vm";
import { clickGameMouse, moveGameMouse, setGameMouseButton } from "../app/game-player/game-mouse.mjs";

const rootDir = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const shellHtmlPath = path.join(rootDir, "scummvm-shell", "scummvm.html");
const shellJsPath = path.join(rootDir, "scummvm-shell", "scummvm.js");
const bootStatePath = path.join(rootDir, "app", "game-player", "useBootState.js");
const gameRouteFramePath = path.join(rootDir, "app", "game-route-frame.js");
const gamePlayerControlsPath = path.join(rootDir, "app", "game-player", "GamePlayerControls.js");

test("the managed data index includes every engine as a separate WebAssembly module", () => {
  const dataDir = path.join(rootDir, "scummvm-shell", "data");
  const pluginDir = path.join(dataDir, "plugins");
  const index = JSON.parse(fs.readFileSync(path.join(dataDir, "index.json"), "utf8"));
  const pluginIndex = JSON.parse(fs.readFileSync(path.join(pluginDir, "index.json"), "utf8"));
  const pluginNames = fs.readdirSync(pluginDir).filter((name) => name.endsWith(".so")).sort();

  assert.deepEqual(Object.keys(index.plugins).sort(), pluginNames);
  assert.deepEqual(index.plugins, pluginIndex);
  for (const name of pluginNames) {
    const binary = fs.readFileSync(path.join(pluginDir, name));
    assert.equal(index.plugins[name], binary.length, name);
    assert.ok(
      WebAssembly.Module.customSections(new WebAssembly.Module(binary), "dylink.0").length,
      `${name} should be a dynamically linked module`
    );
  }
});

test("remote directories supply a numeric stat size to Emscripten", async () => {
  const { ScummvmFS } = await import("../scummvm-shell/scummvm_fs.js");
  const { getattr } = new ScummvmFS(null, { url: "/data", json: {} }).node_ops;

  assert.equal(BigInt(getattr({ size: null }).size), 4096n);
  assert.equal(BigInt(getattr({ size: 0 }).size), 0n);
});

test("managed shell keeps the log sink for detection but hides it from layout", () => {
  const shellHtml = fs.readFileSync(shellHtmlPath, "utf8");

  assert.match(shellHtml, /<textarea[^>]*\bid=output\b[^>]*><\/textarea>/);
  assert.doesNotMatch(shellHtml, /<hr>/i);
  assert.match(
    shellHtml,
    /#output\{[^}]*position:fixed;[^}]*left:-10000px;[^}]*width:1px!important;[^}]*height:1px!important;[^}]*opacity:0;[^}]*pointer-events:none;/
  );
  assert.match(shellHtml, /const output=document\.getElementById\("output"\);/);
  assert.match(shellHtml, /launchPattern&&output&&launchPattern\.test\(output\.value\|\|""\)/);
});

test("boot polling in the app still reads shell output for failures", () => {
  const bootStateSource = fs.readFileSync(bootStatePath, "utf8");

  assert.match(bootStateSource, /getElementById\("output"\)/);
  assert.match(bootStateSource, /"value" in outputElement/);
  assert.match(bootStateSource, /BOOT_FAILURE_PATTERNS\.some\(\(pattern\) => pattern\.test\(outputValue\)\)/);
});

test("the imported intro bridge consumes clicks only at the active native skip point", () => {
  const shell = fs.readFileSync(shellHtmlPath, "utf8");
  const bridge = shell.match(/if \(isLocalGame && !isCatalogArchive && !scummwebLaunchUrl\.searchParams\.has\("continue"\)\) \{[\s\S]+?(?=const readyStatePriority=)/)?.[0];
  assert.ok(bridge, "the generated shell includes the native intro bridge");
  const messages = [];
  const install = (query = "", isCatalogArchive = false) => {
    const scope = {
      isLocalGame: true, isCatalogArchive, scummwebLaunchUrl: new URL("https://scummweb.example/scummvm.html" + query),
      scummwebMessageSource: "scummweb", buildCurrentFrameHref: () => "/scummvm.html#--auto-detect",
      postParentMessage: (message) => messages.push(message.available),
    };
    vm.runInNewContext(bridge, scope);
    return scope;
  };
  const { __scummwebRequestIntroSkip: request, __scummwebUpdateIntroSkip: update } = install();
  assert.equal(request(), false);
  assert.equal(update(true), false);
  assert.equal(request(), true);
  assert.equal(request(), false);
  assert.equal(update(true), true);
  assert.equal(update(true), false);
  assert.equal(request(), true);
  assert.equal(update(false), false);
  assert.equal(update(true), false);
  assert.deepEqual(messages, [true, false, true]);
  assert.equal(install("?continue=1").__scummwebRequestIntroSkip, undefined);
  assert.equal(install("", true).__scummwebRequestIntroSkip, undefined);
});

function createTouchInput() {
  const shellHtml = fs.readFileSync(shellHtmlPath, "utf8");
  const constants = shellHtml.match(/const touchTapDurationMs=[\s\S]+?(?=let gameRunning=)/);
  const handlers = shellHtml.match(/const clamp=[\s\S]+?(?=window\.addEventListener\("message",handleScummwebMessage\))/);
  assert.ok(constants && handlers, "the generated shell includes the touch input handlers");

  const origin = "https://scummweb.example";
  const events = [];
  let now = 0;
  let nextTimer = 0;
  const timers = new Map();
  const parent = {};
  const input = vm.runInNewContext(
    `${constants[0]}
     let activeTouchGesture=null,lastCompletedTap=null,syntheticCursorPoint=null;
     ${handlers[0]}
     ({ start:handleTouchStart, move:handleTouchMove, end:handleTouchEnd,
        cancel:handleTouchCancel, reset:resetSyntheticInput, message:handleScummwebMessage });`,
    {
      scummwebLaunchUrl: { origin },
      Date: { now: () => now },
      window: {
        parent, scrollX: 0, scrollY: 0,
        setTimeout(callback, delay) {
          timers.set(++nextTimer, { at: now + delay, callback });
          return nextTimer;
        },
        clearTimeout: (id) => timers.delete(id),
      },
      canvas: {
        getBoundingClientRect: () => ({ left: 0, top: 0, right: 320, bottom: 200, width: 320, height: 200 }),
        focus() {},
        dispatchEvent(event) { events.push([event.type, event.clientX, event.clientY, event.button, event.buttons]); },
      },
      MouseEvent: class {
        constructor(type, options) { Object.assign(this, { type }, options); }
      },
    }
  );
  const frame = { contentWindow: { postMessage: (data, origin) => input.message({ data, origin, source: parent }) } };
  function advance(ms) {
    const end = now + ms;
    for (;;) {
      const next = [...timers].filter(([, timer]) => timer.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
      if (!next) break;
      const [id, { at, callback }] = next;
      timers.delete(id);
      now = at;
      callback();
    }
    now = end;
  }
  return { input, frame, origin, advance, events };
}

const point = (clientX, clientY) => ({ identifier: 1, clientX, clientY });
const touchEvent = (touches, changedTouches = touches) => ({ touches, changedTouches, stopPropagation() {} });

test("mobile taps position the cursor and double-tap sends a short click", () => {
  const { input, advance, events } = createTouchInput();
  const tap = (x, y) => {
    const touch = point(x, y);
    input.start(touchEvent([touch]));
    advance(100);
    input.end(touchEvent([], [touch]));
  };

  tap(80, 150);
  assert.deepEqual(events, [["mousemove", 80, 150, 0, 0]]);
  tap(80, 150);
  assert.deepEqual(events.at(-1), ["mousedown", 80, 150, 0, 1]);
  advance(79);
  assert.deepEqual(events.at(-1), ["mousedown", 80, 150, 0, 1]);
  advance(1);
  assert.deepEqual(events.slice(-2), [["mouseup", 80, 150, 0, 0], ["click", 80, 150, 0, 0]]);
});

test("holding the game canvas presses left before lifting and drags with the button held", () => {
  const { input, advance, events } = createTouchInput();
  input.start(touchEvent([point(80, 150)]));
  advance(1000);
  assert.deepEqual(events, [["mousemove", 80, 150, 0, 0], ["mousedown", 80, 150, 0, 1]]);
  input.move(touchEvent([point(104, 133)]));
  assert.deepEqual(events.at(-1), ["mousemove", 104, 133, 0, 1]);
  input.end(touchEvent([], [point(106, 132)]));
  assert.deepEqual(events.slice(-2), [["mouseup", 106, 132, 0, 0], ["click", 106, 132, 0, 0]]);

  input.start(touchEvent([point(80, 150)]));
  advance(1000);
  input.cancel(touchEvent([]));
  assert.deepEqual(events.at(-1), ["mouseup", 80, 150, 0, 0]);
});

test("L and R hold through cursor movement and release independently", () => {
  const { input, frame, origin, advance, events } = createTouchInput();
  setGameMouseButton(frame, origin, "left", true);
  setGameMouseButton(frame, origin, "right", true);
  advance(1000);
  assert.deepEqual(events.filter(([type]) => type === "mousedown" || type === "mouseup"), [
    ["mousedown", 160, 100, 0, 1], ["mousedown", 160, 100, 2, 3],
  ]);
  moveGameMouse(frame, origin, 16, -8);
  assert.deepEqual(events.at(-1), ["mousemove", 176, 92, 0, 3]);
  setGameMouseButton(frame, origin, "right", false);
  assert.deepEqual(events.at(-1), ["mouseup", 176, 92, 2, 1]);
  setGameMouseButton(frame, origin, "left", false, true);
  assert.deepEqual(events.at(-1), ["mouseup", 176, 92, 0, 0]);

  // A keyboard activation keeps the click pulse used by the existing remote input.
  clickGameMouse(frame, origin, "right");
  assert.deepEqual(events.at(-1), ["contextmenu", 176, 92, 2, 2]);
  input.reset();
  advance(1000);
  assert.deepEqual(events.at(-1), ["mouseup", 176, 92, 2, 0]);
});

test("mobile canvas swipes move the synthetic cursor relatively", () => {
  const { input, advance, events } = createTouchInput();
  input.start(touchEvent([point(30, 100)]));
  input.move(touchEvent([point(64, 100)]));
  advance(1000);
  input.end(touchEvent([], [point(70, 103)]));
  assert.deepEqual(events, [["mousemove", 194, 100, 0, 0], ["mousemove", 200, 103, 0, 0]]);
});

test("mobile shell supports fill-screen canvas aspect mode", () => {
  const shellHtml = fs.readFileSync(shellHtmlPath, "utf8");

  assert.match(shellHtml, /canvas\.emscripten\.scummweb-fill-screen\{width:100%;height:100%\}/);
  assert.match(
    shellHtml,
    /const setAspectRatioMode=mode=>\{canvas\.classList\.toggle\("scummweb-fill-screen",mode==="fill"\);canvas\.classList\.toggle\("scummweb-fit-height",mode==="fit-height"\)\}/
  );
  assert.match(shellHtml, /event\.data\?\.type==="scummweb-aspect-ratio"/);
});

test("managed ScummVM audio glue primes and sanitizes WebAudio output", () => {
  const shellJs = fs.readFileSync(shellJsPath, "utf8");

  assert.match(shellJs, /SDL3\.audio_playback\.currentPlaybackBuffer=outputBuffer/);
  assert.match(shellJs, /outputBuffer\["getChannelData"\]\(channel\)\.fill\(0\)/);
  assert.match(shellJs, /if\(!Number\.isFinite\(sample\)\)\{sample=0;\+\+abnormalSamples\}/);
  assert.match(shellJs, /if\(abnormalSamples>\$1\*numChannels\/16\)/);
  assert.doesNotMatch(
    shellJs,
    /channelData\[j\]=HEAPF32\[buf\+\(j\*numChannels\+c\)\]/
  );
});

test("mobile mouse play defaults to fit-height and the route has no aspect toggle", () => {
  const routeFrameSource = fs.readFileSync(gameRouteFramePath, "utf8");
  const controlsSource = fs.readFileSync(gamePlayerControlsPath, "utf8");

  assert.match(routeFrameSource, /SCUMMWEB_ASPECT_RATIO_MESSAGE_TYPE = "scummweb-aspect-ratio"/);
  assert.match(routeFrameSource, /mode: immersiveMode\.isMobileViewport && mobileControlMode === "mouse" \? "fit-height" : "preserve"/);
  assert.match(routeFrameSource, /\[frameSrc, immersiveMode\.isMobileViewport, mobileControlMode\]/);
  assert.doesNotMatch(routeFrameSource, /showAspectRatioControl|handleAspectRatioToggle|isFillScreenAspect/);
  assert.doesNotMatch(controlsSource, /is-aspect|AspectRatio|FillScreenAspect/);
  const shellHtml = fs.readFileSync(shellHtmlPath, "utf8");
  assert.match(shellHtml, /canvas\.emscripten\.scummweb-fit-height\{width:calc\(100vh \* var\(--scummweb-canvas-ratio,1\.333333\)\);width:calc\(\(100dvh - env\(safe-area-inset-top\) - env\(safe-area-inset-bottom\)\) \* var\(--scummweb-canvas-ratio,1\.333333\)\);height:auto\}/);
});
