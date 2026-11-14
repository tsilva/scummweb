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

function harness() {
  class Element {
    constructor(tag) { this.tag = tag; this.children = []; this.complete = false; this.naturalWidth = 0; }
    append(child) { this.children.push(child); child.parent = this; }
    remove() { this.parent.children = this.parent.children.filter((child) => child !== this); }
    querySelectorAll(tag) { return this.children.filter((child) => child.tag === tag); }
    querySelector(tag) { return this.querySelectorAll(tag)[0]; }
    removeAttribute(name) { delete this[name]; }
    decode() { this.decodingStarted = true; return Promise.resolve(); }
  }
  const body = new Element("body"), module = { exports: {} };
  runInNewContext(code, {
    module, exports: module.exports,
    require: () => ({ getHeroImageProps: (game) => game }),
    document: { body, createElement: (tag) => new Element(tag) },
    Image: class extends Element { constructor() { super("img"); } },
  });
  return { ...module.exports, body };
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
