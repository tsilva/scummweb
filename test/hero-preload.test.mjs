import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import test from "node:test";
import swc from "next/dist/build/swc/index.js";

await swc.loadBindings();
const url = new URL("../app/home-shell/hero-preload.mjs", import.meta.url);
const { code } = await swc.transform(await readFile(url, "utf8"), {
  filename: url.pathname, swcrc: false, configFile: false, module: { type: "commonjs" },
  jsc: { parser: { syntax: "ecmascript" } },
});

function harness({ deferredDecode = false, failedDecode = false } = {}) {
  class Element {
    constructor(tag) { this.tag = tag; this.children = []; this.complete = false; this.naturalWidth = 0; }
    append(child) { this.children.push(child); child.parent = this; }
    remove() { this.parent.children = this.parent.children.filter((child) => child !== this); }
    querySelectorAll(tag) { return this.children.filter((child) => child.tag === tag); }
    querySelector(tag) { return this.querySelectorAll(tag)[0]; }
    removeAttribute(name) { delete this[name]; }
    decode() {
      this.decodingStarted = true;
      if (failedDecode) return Promise.reject(new Error("Image unavailable"));
      if (!deferredDecode) return Promise.resolve();
      this.decoded ??= new Promise((resolve) => { this.finishDecode = () => {
        this.complete = true; this.naturalWidth = 1200; resolve();
      }; });
      return this.decoded;
    }
  }
  const body = new Element("body"), module = { exports: {} }, frames = new Map();
  let nextFrame = 0;
  runInNewContext(code, {
    module, exports: module.exports,
    require: () => ({ getHeroImageProps: (game) => game }),
    document: { body, createElement: (tag) => new Element(tag) },
    Image: class extends Element { constructor() { super("img"); } },
    requestAnimationFrame: (callback) => { frames.set(++nextFrame, callback); return nextFrame; },
    cancelAnimationFrame: (frame) => frames.delete(frame),
  });
  return { ...module.exports, body, visibleImage: () => new Element("img"),
    paint() {
      const callbacks = [...frames.values()];
      frames.clear();
      for (const callback of callbacks) callback();
    },
  };
}

const first = { src: "/one.webp", srcSet: "/one.webp 1200w", avifSrcSet: "/one.avif 1200w", sizes: "100vw" };
const second = { ...first, src: "/two.webp", srcSet: "/two.webp 1200w", avifSrcSet: "/two.avif 1200w" };

test("leaving an unfinished hero clears all candidates and allows a fresh retry", () => {
  const h = harness();
  const cancel = h.preloadSelectedHero(first);
  const picture = h.body.children[0], image = picture.querySelector("img"), source = picture.querySelector("source");
  assert.equal(image.fetchPriority, "high");
  assert.equal(source.srcset, first.avifSrcSet);
  assert.equal(image.sizes, first.sizes);
  cancel();
  assert.equal(image.src, undefined);
  assert.equal(image.srcset, undefined);
  assert.equal(source.srcset, undefined);
  assert.equal(h.body.children.length, 0);
  h.preloadSelectedHero(first);
  assert.notEqual(h.body.children[0], picture, "cancelled entries must not suppress a retry");
});

test("a newer hover cancels the old request before starting and ignores late leave events", () => {
  const h = harness(), leaveFirst = h.preloadSelectedHero(first);
  const old = h.body.children[0].querySelector("img");
  h.preloadSelectedHero(second);
  assert.equal(old.src, undefined);
  leaveFirst();
  assert.equal(h.body.children.length, 1);
  assert.equal(h.body.children[0].querySelector("img").src, second.src);
  const staleSameGame = h.preloadSelectedHero(second);
  const leaveLatest = h.preloadSelectedHero(second);
  staleSameGame();
  assert.equal(h.body.children.length, 1, "another card for the same game owns the newer claim");
  leaveLatest();
  assert.equal(h.body.children.length, 0);
});

test("clicking retains the in-flight image across hover exit and unmount without restarting it", () => {
  const h = harness(), leave = h.preloadSelectedHero(first);
  const picture = h.body.children[0];
  const unmount = h.preloadSelectedHero(first, undefined, true);
  leave();
  unmount();
  assert.equal(h.body.children.length, 1);
  assert.equal(h.body.children[0], picture);
  assert.equal(picture.querySelector("img").src, first.src);
});

test("completed covers stay decoded while obsolete slideshow preloads release their sources", () => {
  const h = harness(), leave = h.preloadSelectedHero(first);
  const picture = h.body.children[0], image = picture.querySelector("img");
  image.complete = true;
  image.naturalWidth = 1200;
  leave();
  h.preloadSelectedHero(first);
  assert.equal(h.body.children[0], picture);
  const neighbor = h.createHeroPreload(second);
  assert.equal(neighbor.querySelector("img").fetchPriority, "low");
  h.disposeHeroPreload(neighbor);
  assert.equal(neighbor.querySelector("img").src, undefined);
  assert.equal(h.body.children.length, 1);
});

test("slideshow neighbors wait for the visible hero to decode and paint without a hidden duplicate", async () => {
  const h = harness({ deferredDecode: true }), images = new Map(), visible = h.visibleImage();
  h.preloadHeroWindow([first, second], images, visible);
  assert.equal(h.body.children.length, 0, "the rendered cover owns the initial request and decode");
  visible.finishDecode();
  await Promise.resolve();
  h.paint();
  assert.equal(h.body.children.length, 0, "decoding must leave an opportunity to paint first");
  h.paint();
  assert.equal(h.body.children.length, 1, "only the neighboring cover is preloaded");
  assert.equal(images.has(JSON.stringify(first)), false);
  const neighbor = images.get(JSON.stringify(second));
  neighbor.querySelector("img").finishDecode();
  h.preloadHeroWindow([first, second], images, visible);
  assert.equal(images.get(JSON.stringify(second)), neighbor, "ready neighbors stay decoded");
});

test("rapid slideshow changes cancel obsolete downloads and cannot warm a stale window", async () => {
  const h = harness({ deferredDecode: true }), images = new Map(), oldImage = h.visibleImage();
  const obsolete = h.createHeroPreload(first);
  images.set(JSON.stringify(first), obsolete);
  const cancel = h.preloadHeroWindow([first, second], images, oldImage);
  cancel();
  const third = { ...first, src: "/three.webp" }, visible = h.visibleImage();
  h.preloadHeroWindow([second, third], images, visible);
  assert.equal(obsolete.querySelector("img").src, undefined);
  oldImage.finishDecode();
  await Promise.resolve();
  h.paint();
  h.paint();
  assert.equal(h.body.children.length, 0, "late decoding cannot revive the previous window");
  visible.finishDecode();
  await Promise.resolve();
  h.paint();
  h.paint();
  assert.equal(h.body.children.length, 1);
  assert.equal(h.body.children[0].querySelector("img").src, third.src);
});

test("a cached visible hero still paints before warming, and cancelled frames stay cancelled", () => {
  const h = harness(), images = new Map(), visible = h.visibleImage();
  visible.complete = true;
  visible.naturalWidth = 1200;
  const cancel = h.preloadHeroWindow([first, second], images, visible);
  h.paint();
  assert.equal(h.body.children.length, 0);
  cancel();
  h.paint();
  assert.equal(h.body.children.length, 0);
  h.preloadHeroWindow([first, second], images, visible);
  h.paint();
  h.paint();
  assert.equal(h.body.children.length, 1);
});

test("missing or failed visible artwork does not trigger speculative downloads", async () => {
  const h = harness({ failedDecode: true }), images = new Map();
  h.preloadHeroWindow([first, second], images, null);
  h.preloadHeroWindow([first, second], images, h.visibleImage());
  await Promise.resolve();
  h.paint();
  h.paint();
  assert.equal(h.body.children.length, 0);
});
