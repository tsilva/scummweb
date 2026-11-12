import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import test from "node:test";

const immersiveSource = (await readFile(new URL("../app/game-player/immersive-mode.mjs", import.meta.url), "utf8"))
  .replace(/^import .*controller-device.mjs.*$/m, "")
  .replaceAll("export ", "");
const source = (await readFile(new URL("../app/game-player/useImmersiveMode.js", import.meta.url), "utf8"))
  .replace('import { useEffect, useRef, useState } from "react";', "")
  .replace(/^import .*immersive-mode.mjs.*$/m, "")
  .replace("export function useImmersiveMode", "function useImmersiveMode");

function player({ fullscreen = false, landscape = false, mobile = true, tv = false, narrow = mobile,
  denied = false, deferred = false, unsupportedOrientation = false, installed = false } = {}) {
  const hooks = [];
  const listeners = new Map();
  let cursor = 0;
  let dirty = false;
  let effects = [];
  let requests = 0;
  const actions = [];
  const pending = Promise.withResolvers();
  const document = Object.assign(new EventTarget(), {
    fullscreenElement: null,
    async exitFullscreen() {
      actions.push("exit");
      this.fullscreenElement = null;
      this.dispatchEvent(new Event("fullscreenchange"));
    },
  });
  const root = fullscreen ? {
    async requestFullscreen() {
      requests++;
      actions.push("fullscreen");
      if (denied) throw new Error("Fullscreen denied");
      if (deferred) await pending.promise;
      document.fullscreenElement = root;
      document.dispatchEvent(new Event("fullscreenchange"));
    },
  } : {};
  document.documentElement = root;
  const shellRef = { current: root };
  const window = {
    innerWidth: 390, innerHeight: 844,
    matchMedia: (query) => ({
      matches: {
        "(orientation: landscape)": landscape,
        "(max-width: 900px)": narrow,
        "(pointer: coarse)": mobile,
        "(display-mode: standalone), (display-mode: minimal-ui)": installed && !document.fullscreenElement,
        "(display-mode: fullscreen)": Boolean(document.fullscreenElement),
      }[query],
      addEventListener() {}, removeEventListener() {},
    }),
    addEventListener: (name, listener) => listeners.set(name, listener),
    removeEventListener: (name) => listeners.delete(name),
  };
  const context = {
    window, navigator: { maxTouchPoints: mobile ? 1 : 0, userAgent: mobile ? "iPhone" : "Desktop" },
    isKnownTvBrowser: () => tv, console, queueMicrotask,
    // Physical screen orientation may disagree with the browser viewport.
    screen: { orientation: {
      type: landscape ? "portrait-primary" : "landscape-primary",
      lock: unsupportedOrientation ? undefined : async (orientation) => { actions.push(orientation); },
      unlock: unsupportedOrientation ? undefined : () => { actions.push("unlock"); },
    } },
    document,
    useState(initial) {
      const index = cursor++;
      hooks[index] ??= { value: typeof initial === "function" ? initial() : initial };
      return [hooks[index].value, (value) => {
        if (!Object.is(hooks[index].value, value)) { hooks[index].value = value; dirty = true; }
      }];
    },
    useRef(value) { const index = cursor++; return hooks[index] ??= { current: value }; },
    useEffect(callback, deps) {
      const index = cursor++;
      const previous = hooks[index];
      if (!previous || deps.some((value, i) => !Object.is(value, previous.deps[i]))) {
        hooks[index] = { deps };
        effects.push(() => { previous?.cleanup?.(); hooks[index].cleanup = callback(); });
      }
    },
  };
  runInNewContext(`${immersiveSource}\n${source}\nthis.useImmersiveMode = useImmersiveMode; this.begin = beginGameLaunch; this.exit = exitImmersiveMode;`, context);
  let state;
  async function settle() {
    for (let attempt = 0; attempt < 10; attempt++) {
      dirty = false;
      cursor = 0;
      state = context.useImmersiveMode({ shellRef });
      for (const effect of effects.splice(0)) effect();
      await new Promise(setImmediate);
      if (!dirty) return state;
    }
    throw new Error("Mobile player did not settle");
  }
  return {
    settle, listeners, actions, document,
    begin: context.begin, exit: context.exit,
    resolveFullscreen: pending.resolve,
    unmount: () => { for (const hook of hooks) hook?.cleanup?.(); },
    requests: () => requests,
  };
}

test("unsupported fullscreen still identifies a portrait mobile player", async () => {
  const client = player({ unsupportedOrientation: true });
  assert.equal(client.begin(), true);
  const state = await client.settle();
  assert.equal(state.canFullscreen, false);
  assert.equal(state.isTouchMobile, true);
  assert.equal(state.isMobileViewport, true);
  assert.equal(state.isLandscapeViewport, false);
  await client.exit();
});

test("Play requests fullscreen synchronously and the mounted player reuses it", async () => {
  const client = player({ fullscreen: true });
  client.begin();
  assert.deepEqual(client.actions, ["fullscreen"]);
  const state = await client.settle();
  assert.equal(state.isFullscreen, true);
  assert.equal(client.requests(), 1);
  assert.deepEqual(client.actions, ["fullscreen", "landscape"]);
});

test("a refused request does not retry fullscreen on later game input", async () => {
  const client = player({ fullscreen: true, denied: true });
  client.begin();
  const state = await client.settle();
  assert.equal(state.isMobileViewport, true);
  assert.equal(state.isLandscapeViewport, false);
  assert.equal(client.requests(), 1);
  for (const event of ["pointerup", "touchend", "keydown"]) assert.equal(client.listeners.has(event), false);
  await client.exit();
});

test("exiting during a pending fullscreen request prevents a late landscape lock", async () => {
  const client = player({ fullscreen: true, deferred: true });
  client.begin();
  const exiting = client.exit();
  client.resolveFullscreen();
  await exiting;
  assert.deepEqual(client.actions, ["fullscreen", "exit", "unlock"]);
  assert.equal(client.document.fullscreenElement, null);
});

test("leaving the route releases fullscreen and orientation for browsing", async () => {
  const client = player({ fullscreen: true });
  client.begin();
  await client.settle();
  client.unmount();
  await new Promise(setImmediate);
  assert.deepEqual(client.actions, ["fullscreen", "landscape", "exit", "unlock"]);
});

test("browser fullscreen exit while playing keeps requesting landscape", async () => {
  const client = player({ fullscreen: true });
  client.begin();
  assert.equal((await client.settle()).isFullscreen, true);
  await client.document.exitFullscreen();
  assert.equal((await client.settle()).isFullscreen, false);
  assert.deepEqual(client.actions, ["fullscreen", "landscape", "exit", "landscape"]);
});

test("a direct mobile launch requests landscape even without fullscreen support", async () => {
  const client = player({ landscape: true });
  const state = await client.settle();
  assert.equal(state.isTouchMobile, true);
  assert.equal(state.isLandscapeViewport, true);
  assert.deepEqual(client.actions, ["landscape"]);
});

for (const installed of [false, true]) {
  test(`desktop play allows toggling fullscreen in ${installed ? "an installed window" : "a browser tab"}`, async () => {
    const client = player({ fullscreen: true, mobile: false, installed });
    assert.equal(client.begin(), false);
    const state = await client.settle();
    assert.equal(state.isMobileViewport, false);
    assert.equal(client.requests(), 0);
    await state.handleFullscreenToggle();
    const fullscreenState = await client.settle();
    assert.equal(fullscreenState.isFullscreen, true);
    assert.equal(fullscreenState.canFullscreen, true);
    await fullscreenState.handleFullscreenToggle();
    assert.equal((await client.settle()).isFullscreen, false);
    assert.deepEqual(client.actions, ["fullscreen", "exit"]);
  });
}

test("a narrow desktop viewport does not automatically enter fullscreen", async () => {
  const client = player({ fullscreen: true, mobile: false, narrow: true });
  assert.equal(client.begin(), false);
  assert.equal((await client.settle()).isTouchMobile, false);
  assert.equal(client.requests(), 0);
});

test("TV Play enters fullscreen from the launch gesture without rotating the display", async () => {
  const client = player({ fullscreen: true, mobile: false, tv: true });
  assert.equal(client.begin(), true);
  assert.deepEqual(client.actions, ["fullscreen"]);
  assert.equal((await client.settle()).isFullscreen, true);
  assert.equal(client.requests(), 1);
  await client.exit();
  assert.deepEqual(client.actions, ["fullscreen", "exit"]);
});
