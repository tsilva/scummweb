import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import test from "node:test";

const source = (await readFile(new URL("../app/game-player/useImmersiveMode.js", import.meta.url), "utf8"))
  .replace('import { useEffect, useRef, useState } from "react";', "")
  .replace("export function useImmersiveMode", "function useImmersiveMode");

function player({ fullscreen = false, landscape = false } = {}) {
  const hooks = [];
  const listeners = new Set();
  let cursor = 0;
  let dirty = false;
  let effects = [];
  let requests = 0;
  const shellRef = { current: fullscreen ? {
    async requestFullscreen() { requests++; throw new Error("Fullscreen denied"); },
  } : {} };
  const window = {
    innerWidth: 390, innerHeight: 844,
    matchMedia: (query) => ({
      matches: query.includes("landscape") ? landscape : true,
      addEventListener() {}, removeEventListener() {},
    }),
    addEventListener: (name) => listeners.add(name), removeEventListener() {},
  };
  const context = {
    window, navigator: { maxTouchPoints: 1 }, console,
    // Physical screen orientation may disagree with the browser viewport.
    screen: { orientation: { type: landscape ? "portrait-primary" : "landscape-primary", unlock() {} } },
    document: { exitFullscreen() {}, addEventListener() {}, removeEventListener() {} },
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
  runInNewContext(`${source}\nthis.useImmersiveMode = useImmersiveMode;`, context);
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
  return { settle, listeners, requests: () => requests };
}

test("portrait play remains available without a fullscreen API", async () => {
  const client = player();
  let state = await client.settle();
  assert.equal(state.canFullscreen, false);
  assert.equal(state.isLandscapeViewport, false);
  state.dismissMobileOverlay();
  state = await client.settle();
  assert.equal(state.mobileOverlayDismissed, true);
  assert.equal(state.needsImmersiveRetry, false);
});

test("a rejected fullscreen retry allows play and does not intercept later game taps", async () => {
  const client = player({ fullscreen: true, landscape: true });
  let state = await client.settle();
  assert.equal(state.isLandscapeViewport, true);
  assert.equal(state.needsImmersiveRetry, true);
  assert.equal(client.requests(), 1);
  await state.handleImmersiveResume();
  state = await client.settle();
  assert.equal(state.mobileOverlayDismissed, true);
  assert.equal(state.needsImmersiveRetry, false);
  assert.equal(client.requests(), 2);
  for (const event of ["pointerup", "touchend", "keydown"]) assert.equal(client.listeners.has(event), false);
});

test("fullscreen can be declined without issuing another request", async () => {
  const client = player({ fullscreen: true });
  const state = await client.settle();
  state.dismissMobileOverlay();
  assert.equal((await client.settle()).mobileOverlayDismissed, true);
  assert.equal(client.requests(), 1);
});
