import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import test from "node:test";
import * as voiceFullscreen from "../app/game-player/voice-fullscreen.mjs";
import swc from "next/dist/build/swc/index.js";
import * as voiceCommands from "../app/game-player/voice-command.mjs";
const { createVoiceCommand, getSpeechRecognition, isZorkVoiceGame } = voiceCommands;

function speechHost(prefixed = false) {
  const instances = [];
  const timers = new Map();
  class Recognition {
    constructor() { instances.push(this); this.stops = 0; this.aborts = 0; }
    start() { this.started = true; }
    stop() { this.stops++; }
    abort() { this.aborts++; }
    result(transcript, isFinal = true) { this.onresult?.({ results: [Object.assign([{ transcript }], { isFinal })] }); }
    end() { this.onend?.(); }
    error(error) { this.onerror?.({ error }); }
  }
  let nextTimer = 0;
  const host = {
    isSecureContext: true,
    [prefixed ? "webkitSpeechRecognition" : "SpeechRecognition"]: Recognition,
    setTimeout(callback, duration) { const id = ++nextTimer; timers.set(id, { callback, duration }); return id; },
    clearTimeout(id) { timers.delete(id); },
  };
  return { host, instances, timers };
}

function input(prefixed) {
  const fake = speechHost(prefixed);
  const commands = [];
  const states = [];
  let unavailable = false;
  const controller = createVoiceCommand(fake.host, {
    onState: (state, message) => states.push({ state, message }),
    onCommand: (command) => { commands.push(command); return true; },
    onUnavailable: () => { unavailable = true; },
  });
  return { ...fake, controller, commands, states, get unavailable() { return unavailable; } };
}

test("voice is limited to Zork I–III and detects secure, native and Safari recognition", () => {
  for (const gameId of ["zork1", "zork2", "zork3"]) assert.equal(isZorkVoiceGame({ engineId: "glk", gameId }), true);
  for (const game of [undefined, { engineId: "glk", gameId: "other" }, { engineId: "zvision", gameId: "zgi" }]) {
    assert.equal(isZorkVoiceGame(game), false);
  }
  assert.equal(getSpeechRecognition({}), null);
  assert.equal(getSpeechRecognition({ isSecureContext: false, SpeechRecognition: class {} }), null);
  const { host } = speechHost(true);
  assert.equal(getSpeechRecognition(host), host.webkitSpeechRecognition);
});

for (const prefixed of [false, true]) {
  test(`${prefixed ? "Safari" : "standard"} recognition waits for release and final results, submitting once`, () => {
    const player = input(prefixed);
    assert.equal(player.controller.start(), true);
    const recognition = player.instances[0];
    assert.equal(recognition.lang, "en-US");
    recognition.result("Open mail", false);
    player.controller.release();
    assert.equal(recognition.stops, 1);
    assert.deepEqual(player.commands, []);
    assert.equal(player.states.at(-1).state, "processing");
    assert.equal(player.controller.start(), false);
    recognition.result("Open mailbox.");
    recognition.result("Open mailbox.");
    recognition.end();
    recognition.end();
    player.controller.release();
    assert.deepEqual(player.commands, ["open mailbox"]);
    assert.equal(player.timers.size, 0);
    assert.equal(player.controller.start(), true);
    player.controller.cancel();
  });
}

test("recognition ending naturally never submits until the finger is released", () => {
  const player = input();
  player.controller.start();
  player.instances[0].result("  Read   the leaflet! ");
  player.instances[0].end();
  assert.deepEqual(player.commands, []);
  assert.equal(player.states.at(-1).state, "holding");
  player.controller.release();
  assert.deepEqual(player.commands, ["read the leaflet"]);
});

test("release while the native permission prompt is pending also stops on start", () => {
  const player = input();
  player.controller.start();
  player.controller.release();
  const recognition = player.instances[0];
  recognition.onstart();
  assert.equal(recognition.stops, 2);
  recognition.result("North");
  recognition.end();
  assert.deepEqual(player.commands, ["north"]);
});

test("cancel aborts recording and discards late results, including during transcription", () => {
  for (const released of [false, true]) {
    const player = input();
    player.controller.start();
    if (released) player.controller.release();
    player.controller.cancel();
    player.instances[0].result("Restart.");
    player.instances[0].end();
    assert.equal(player.instances[0].aborts, 1);
    assert.deepEqual(player.commands, []);
    assert.equal(player.timers.size, 0);
  }
});

for (const transcript of ["", "...", "aller à l’est", "a".repeat(256)]) {
  test(`empty or invalid speech never submits Enter: ${transcript.slice(0, 20)}`, () => {
    const player = input();
    player.controller.start();
    player.instances[0].result(transcript);
    player.controller.release();
    player.instances[0].end();
    assert.deepEqual(player.commands, []);
    assert.ok(player.states.at(-1).message);
  });
}

test("unavailable native services hide the mic and never submit partial speech", () => {
  for (const error of ["not-allowed", "service-not-allowed", "audio-capture", "language-not-supported"]) {
    const player = input();
    player.controller.start();
    player.instances[0].result("Restart.");
    player.instances[0].error(error);
    player.controller.release();
    player.instances[0].end();
    assert.equal(player.unavailable, true);
    assert.deepEqual(player.commands, []);
    assert.equal(player.timers.size, 0);
  }
});

test("no speech, network errors and timeouts recover without sending a command", () => {
  for (const error of ["no-speech", "network"]) {
    const player = input();
    player.controller.start();
    player.instances[0].error(error);
    assert.equal(player.unavailable, false);
    assert.equal(player.controller.start(), true);
    player.controller.cancel();
  }
  for (const released of [false, true]) {
    const player = input();
    player.controller.start();
    if (released) player.controller.release();
    const { callback, duration } = [...player.timers.values()][0];
    assert.equal(duration, released ? 10_000 : 60_000);
    callback();
    player.instances[0].result("Restart");
    player.instances[0].end();
    assert.deepEqual(player.commands, []);
    assert.equal(player.timers.size, 0);
  }
});

const componentUrl = new URL("../app/game-player/GameVoiceCommand.js", import.meta.url);
const requireNative = createRequire(componentUrl);
await swc.loadBindings();
const { code } = await swc.transform(await readFile(componentUrl, "utf8"), {
  filename: componentUrl.pathname, swcrc: false, configFile: false,
  module: { type: "commonjs" },
  jsc: { parser: { syntax: "ecmascript", jsx: true }, transform: { react: { runtime: "automatic" } } },
});

function microphone({ supported = true, fullscreen = false, deniedFullscreen = false } = {}) {
  const fake = speechHost(true);
  const host = Object.assign(new EventTarget(), fake.host);
  if (!supported) delete host.webkitSpeechRecognition;
  const document = Object.assign(new EventTarget(), { hidden: false });
  host.document = document;
  document.documentElement = {};
  document.fullscreenElement = fullscreen ? document.documentElement : null;
  const frameRef = { current: Object.assign(new EventTarget(), { contentDocument: new EventTarget() }) };
  const shellRef = { current: {} };
  const fullscreenRequests = [];
  const commands = [];
  const hooks = [];
  let cursor = 0;
  let effects = [];
  let props = { frameRef, shellRef, enabled: true };
  let tree;
  const module = { exports: {} };
  runInNewContext(code, {
    module, exports: module.exports, window: host, document,
    require(name) {
      if (name === "./voice-command.mjs") return voiceCommands;
      if (name === "./voice-fullscreen.mjs") return voiceFullscreen;
      if (name === "./immersive-mode.mjs") return { async enterImmersiveMode(target) {
        fullscreenRequests.push(target);
        if (deniedFullscreen) return false;
        document.fullscreenElement = target;
        document.dispatchEvent(new Event("fullscreenchange"));
        return true;
      } };
      if (name === "./keyboard") return { dispatchGameCommand(frame, command) { commands.push({ frame, command }); return true; } };
      if (name === "react") return {
        useRef(initial) { return hooks[cursor++] ??= { current: initial }; },
        useState(initial) {
          const index = cursor++;
          hooks[index] ??= { value: initial };
          return [hooks[index].value, (value) => { hooks[index].value = value; }];
        },
        useEffect(callback, deps) {
          const index = cursor++;
          const previous = hooks[index];
          if (!previous || deps.some((dep, i) => dep !== previous.deps[i])) {
            const entry = hooks[index] = { deps };
            effects.push(() => { previous?.cleanup?.(); entry.cleanup = callback(); });
          }
        },
      };
      return requireNative(name);
    },
  });
  function render(update = {}) {
    props = { ...props, ...update };
    cursor = 0;
    tree = module.exports.default(props);
    for (const effect of effects.splice(0)) effect();
  }
  render();
  render();
  return {
    ...fake, host, document, frameRef, commands, render, fullscreenRequests,
    allowFullscreen() { deniedFullscreen = false; },
    get button() { return tree.props.children.find((child) => child?.type === "button")?.props; },
    get status() { return tree.props.children.find((child) => child?.props?.role === "status")?.props.children; },
    unmount() { for (const hook of hooks) hook?.cleanup?.(); },
  };
}

function pointer(pointerId = 1) {
  return { pointerId, button: 0, preventDefault() {}, currentTarget: { setPointerCapture() {} } };
}

function leaveFullscreen(player) {
  player.document.fullscreenElement = null;
  player.document.dispatchEvent(new Event("fullscreenchange"));
}

test("microphone restores its original fullscreen target when permission resolves", async () => {
  const player = microphone({ fullscreen: true });
  player.button.onPointerDown(pointer());
  leaveFullscreen(player);
  assert.equal(player.fullscreenRequests.length, 0);
  player.instances[0].onstart();
  await new Promise(setImmediate);
  assert.deepEqual(player.fullscreenRequests, [player.document.documentElement]);
  assert.equal(player.document.fullscreenElement, player.document.documentElement);
  leaveFullscreen(player);
  player.host.dispatchEvent(new Event("focus"));
  assert.equal(player.fullscreenRequests.length, 1, "recovery ends after success");
  player.unmount();
});

test("releasing the microphone before the permission UI exits fullscreen preserves recovery", async () => {
  const player = microphone({ fullscreen: true });
  player.button.onPointerDown(pointer());
  player.document.dispatchEvent(Object.defineProperty(new Event("pointerup"), "isTrusted", { value: true }));
  player.button.onPointerUp(pointer());
  leaveFullscreen(player);
  player.instances[0].onstart();
  await new Promise(setImmediate);
  assert.equal(player.fullscreenRequests.length, 1);
  player.unmount();
});

test("permission blur can cancel recording while focus still restores fullscreen", async () => {
  const player = microphone({ fullscreen: true });
  player.button.onPointerDown(pointer());
  player.host.dispatchEvent(new Event("blur"));
  leaveFullscreen(player);
  assert.equal(player.fullscreenRequests.length, 0);
  player.host.dispatchEvent(new Event("focus"));
  await new Promise(setImmediate);
  assert.equal(player.fullscreenRequests.length, 1);
  assert.deepEqual(player.commands, []);
  player.unmount();
});

for (const location of ["toolbar", "game"]) {
  test(`blocked fullscreen recovery retries on the next trusted ${location} gesture`, async () => {
    const player = microphone({ fullscreen: true, deniedFullscreen: true });
    player.button.onPointerDown(pointer());
    leaveFullscreen(player);
    player.instances[0].onstart();
    await new Promise(setImmediate);
    assert.equal(player.fullscreenRequests.length, 1);
    player.allowFullscreen();
    const owner = location === "game" ? player.frameRef.current.contentDocument : player.document;
    owner.dispatchEvent(new Event("pointerup"));
    assert.equal(player.fullscreenRequests.length, 1, "synthetic input must not restore fullscreen");
    owner.dispatchEvent(Object.defineProperty(new Event("pointerup"), "isTrusted", { value: true }));
    await new Promise(setImmediate);
    assert.equal(player.fullscreenRequests.length, 2);
    assert.equal(player.document.fullscreenElement, player.document.documentElement);
    player.unmount();
  });
}

test("voice fullscreen recovery respects windowed play, menus, and player teardown", async () => {
  for (const fullscreen of [false, true]) {
    for (const action of ["menu", "exit"]) {
      const player = microphone({ fullscreen, deniedFullscreen: true });
      player.button.onPointerDown(pointer());
      leaveFullscreen(player);
      player.instances[0].onstart();
      await new Promise(setImmediate);
      const before = player.fullscreenRequests.length;
      if (action === "menu") player.render({ enabled: false });
      else player.unmount();
      player.allowFullscreen();
      player.host.dispatchEvent(new Event("focus"));
      player.document.dispatchEvent(Object.defineProperty(new Event("pointerup"), "isTrusted", { value: true }));
      assert.equal(player.fullscreenRequests.length, before);
      if (!fullscreen) assert.equal(before, 0);
      player.unmount();
    }
  }
});

test("mic stays hidden without native recognition and starts only on a deliberate hold", () => {
  const unsupported = microphone({ supported: false });
  assert.equal(unsupported.button, undefined);
  unsupported.unmount();
  const player = microphone();
  assert.equal(player.instances.length, 0);
  assert.equal(player.button["aria-label"], "Hold to speak a command");
  player.button.onPointerDown(pointer());
  player.render();
  assert.equal(player.instances.length, 1);
  assert.equal(player.button["aria-pressed"], true);
  player.button.onPointerDown(pointer(2));
  player.button.onPointerUp(pointer(2));
  assert.equal(player.instances[0].stops, 0);
  player.button.onPointerUp(pointer());
  player.button.onLostPointerCapture(pointer());
  player.render();
  assert.equal(player.button.disabled, true);
  player.instances[0].result("Look.");
  player.instances[0].end();
  player.render();
  assert.deepEqual(player.commands, [{ frame: player.frameRef.current, command: "look" }]);
  assert.equal(player.button.disabled, false);
  player.unmount();
});

test("cancelled gestures, menus, backgrounding and unmount discard pending voice input", () => {
  for (const cancel of [
    (player) => player.button.onPointerCancel(pointer()),
    (player) => player.button.onLostPointerCapture(pointer()),
    (player) => player.render({ enabled: false }),
    (player) => player.host.dispatchEvent(new Event("blur")),
    (player) => player.host.dispatchEvent(new Event("pagehide")),
    (player) => { player.document.hidden = true; player.document.dispatchEvent(new Event("visibilitychange")); },
    (player) => player.unmount(),
  ]) {
    const player = microphone();
    player.button.onPointerDown(pointer());
    cancel(player);
    player.instances[0].result("Restart");
    player.instances[0].end();
    player.button.onPointerUp(pointer());
    assert.deepEqual(player.commands, []);
    assert.equal(player.instances[0].aborts, 1);
    assert.equal(player.timers.size, 0);
    player.unmount();
  }
});

test("mic hides when native permission is denied and supports held Space/Enter activation", () => {
  const denied = microphone();
  denied.button.onPointerDown(pointer());
  denied.instances[0].error("not-allowed");
  denied.render();
  assert.equal(denied.button, undefined);
  assert.match(denied.status, /unavailable/);
  denied.unmount();
  for (const key of [" ", "Enter"]) {
    const player = microphone();
    const event = { key, repeat: false, preventDefault() {} };
    player.button.onKeyDown(event);
    player.button.onKeyDown({ ...event, repeat: true });
    assert.equal(player.instances.length, 1);
    player.instances[0].result("Inventory");
    player.instances[0].end();
    assert.equal(player.commands.length, 0);
    player.button.onKeyUp(event);
    assert.equal(player.commands[0].command, "inventory");
    player.unmount();
  }
});
