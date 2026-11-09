import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import vm from "node:vm";
import { clickGameMouse } from "../app/game-player/game-mouse.mjs";

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

test("mobile touch click shim holds button state long enough for polling engines", () => {
  const shellHtml = fs.readFileSync(shellHtmlPath, "utf8");

  assert.match(shellHtml, /const touchSyntheticClickHoldMs=80;/);
  assert.match(
    shellHtml,
    /window\.setTimeout\(\(\(\)=>\{dispatchPointerEvent\("pointerup",point,\{button,buttons:0\}\);dispatchMouseEvent\("mouseup",point,\{button,buttons:0\}\);/
  );
  assert.match(shellHtml, /dispatchMouseEvent\("click",point,\{button,buttons:0,detail:1\}\)/);
  assert.match(shellHtml, /dispatchMouseEvent\("contextmenu",point,\{button,buttons,detail:0\}\)/);
});

test("Teen Agent taps position the cursor and double-tap, L, and R send mouse clicks", () => {
  const shellHtml = fs.readFileSync(shellHtmlPath, "utf8");
  const constants = shellHtml.match(/const touchTapDurationMs=[\s\S]+?(?=let gameRunning=)/);
  const handlers = shellHtml.match(/const clamp=[\s\S]+?(?=window\.addEventListener\("message",handleScummwebMessage\))/);
  assert.ok(constants && handlers, "the generated shell includes the touch input handlers");

  const origin = "https://scummweb.example";
  const events = [];
  let now = 0;
  const input = vm.runInNewContext(
    `${constants[0]}
     let activeTouchGesture=null,lastCompletedTap=null,syntheticCursorPoint=null;
     ${handlers[0]}
     ({ start:handleTouchStart, end:handleTouchEnd, message:handleScummwebMessage });`,
    {
      __scummwebSaveStatus: { engineId: "teenagent" },
      scummwebLaunchUrl: { origin },
      Date: { now: () => now },
      window: { scrollX: 0, scrollY: 0, setTimeout() {} },
      canvas: {
        getBoundingClientRect: () => ({ left: 0, top: 0, right: 320, bottom: 200, width: 320, height: 200 }),
        focus() {},
        dispatchEvent(event) { events.push([event.type, event.clientX, event.clientY, event.button]); },
      },
      MouseEvent: class {
        constructor(type, options) { Object.assign(this, { type }, options); }
      },
    }
  );
  const frame = { contentWindow: { postMessage: (data, origin) => input.message({ data, origin }) } };
  const tap = (clientX, clientY) => {
    const point = { clientX, clientY };
    const stopPropagation = () => {};
    input.start({ touches: [point], stopPropagation });
    now += 100;
    input.end({ touches: [], changedTouches: [point], stopPropagation });
  };
  const clicks = () => events.filter(([type]) => type === "mousedown");

  tap(80, 150);
  assert.deepEqual(events, [["mousemove", 80, 150, 0]]);
  tap(80, 150);
  assert.deepEqual(clicks(), [["mousedown", 80, 150, 0]]);
  tap(180, 160);
  clickGameMouse(frame, origin, "left");
  tap(130, 110);
  clickGameMouse(frame, origin, "right");
  assert.deepEqual(clicks(), [
    ["mousedown", 80, 150, 0],
    ["mousedown", 180, 160, 0],
    ["mousedown", 130, 110, 2],
  ]);
});

test("mobile canvas swipes move the synthetic cursor relatively", () => {
  const shellHtml = fs.readFileSync(shellHtmlPath, "utf8");

  assert.match(shellHtml, /const touchRelativeMoveScale=1;/);
  assert.match(shellHtml, /const touchRelativeMoveMaxDeltaPx=48;/);
  assert.match(
    shellHtml,
    /const applyRelativeTouchDelta=\(previousPoint,nextFingerPoint\)=>\{[^}]*nextFingerPoint\.clientX-previousPoint\.clientX[^}]*applyCursorPadDelta\(deltaX,deltaY\)/
  );
  assert.match(
    shellHtml,
    /if\(activeTouchGesture\.moved\)\{applyRelativeTouchDelta\(previousPoint,point\)\}activeTouchGesture\.lastPoint=point/
  );
  assert.match(
    shellHtml,
    /if\(activeTouchGesture\.moved&&point\)\{applyRelativeTouchDelta\(activeTouchGesture\.lastPoint,point\)\}/
  );
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
