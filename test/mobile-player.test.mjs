import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import test from "node:test";

const immersiveSource = (await readFile(new URL("../app/game-player/immersive-mode.mjs", import.meta.url), "utf8"))
  .replaceAll("export ", "");
const source = (await readFile(new URL("../app/game-player/useImmersiveMode.js", import.meta.url), "utf8"))
  .replace('import { useEffect, useRef, useState } from "react";', "")
  .replace(/^import .*immersive-mode.mjs.*$/m, "")
  .replace("export function useImmersiveMode", "function useImmersiveMode");

function player({ fullscreen = false, landscape = false, mobile = true, denied = false, deferred = false, unsupportedOrientation = false } = {}) {
  const hooks = [];
  const listeners = new Set();
  let cursor = 0;
  let dirty = false;
  let effects = [];
  let requests = 0;
  const actions = [];
  const pending = Promise.withResolvers();
  const document = {
    fullscreenElement: null,
    async exitFullscreen() { actions.push("exit"); this.fullscreenElement = null; },
    addEventListener() {}, removeEventListener() {},
  };
  const root = fullscreen ? {
    async requestFullscreen() {
      requests++;
      actions.push("fullscreen");
      if (denied) throw new Error("Fullscreen denied");
      if (deferred) await pending.promise;
      document.fullscreenElement = root;
    },
  } : {};
  document.documentElement = root;
  const shellRef = { current: root };
  const window = {
    innerWidth: 390, innerHeight: 844,
    matchMedia: (query) => ({
      matches: query.includes("landscape") ? landscape : mobile,
      addEventListener() {}, removeEventListener() {},
    }),
    addEventListener: (name) => listeners.add(name), removeEventListener() {},
  };
  const context = {
    window, navigator: { maxTouchPoints: mobile ? 1 : 0 }, console, queueMicrotask,
    // Physical screen orientation may disagree with the browser viewport.
    screen: { orientation: {
      type: landscape ? "portrait-primary" : "landscape-primary",
      lock: unsupportedOrientation ? undefined : async (orientation) => { actions.push(orientation); },
      unlock() { actions.push("unlock"); },
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
  runInNewContext(`${immersiveSource}\n${source}\nthis.useImmersiveMode = useImmersiveMode; this.begin = beginMobileGameLaunch; this.exit = exitImmersiveMode; this.resume = resumeMobileGameLaunch;`, context);
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
    settle, listeners, actions, document, shellRef,
    begin: context.begin, exit: context.exit, resume: context.resume,
    resolveFullscreen: pending.resolve,
    unmount: () => { for (const hook of hooks) hook?.cleanup?.(); },
    requests: () => requests,
  };
}

test("unsupported fullscreen leaves mobile play available without a modal", async () => {
  const client = player({ unsupportedOrientation: true });
  assert.equal(client.begin(), true);
  const state = await client.settle();
  assert.equal(state.canFullscreen, false);
  assert.equal(state.isMobileViewport, true);
  assert.equal(state.isLandscapeViewport, false);
  assert.equal(state.needsImmersiveRetry, undefined);
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
  await state.exitImmersiveMode();
  assert.deepEqual(client.actions, ["fullscreen", "landscape", "portrait", "exit", "unlock"]);
});

test("a refused request never causes a modal or retries on later game input", async () => {
  const client = player({ fullscreen: true, denied: true });
  client.begin();
  const state = await client.settle();
  assert.equal(state.isMobileViewport, true);
  assert.equal(state.needsImmersiveRetry, undefined);
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
  assert.deepEqual(client.actions, ["fullscreen", "portrait", "exit", "unlock"]);
  assert.equal(client.document.fullscreenElement, null);
});

test("leaving the route restores portrait and releases fullscreen", async () => {
  const client = player({ fullscreen: true });
  client.begin();
  await client.settle();
  client.unmount();
  await new Promise(setImmediate);
  assert.deepEqual(client.actions, ["fullscreen", "landscape", "portrait", "exit", "unlock"]);
});

test("desktop launches keep the normal browser orientation", async () => {
  const client = player({ fullscreen: true, mobile: false });
  assert.equal(client.begin(), false);
  const state = await client.settle();
  assert.equal(state.isMobileViewport, false);
  assert.equal(client.requests(), 0);
  await state.handleFullscreenToggle();
  await state.handleFullscreenToggle();
  assert.deepEqual(client.actions.filter((action) => action !== "unlock"), ["fullscreen", "exit"]);
});
