import assert from "node:assert/strict";
import { runInNewContext } from "node:vm";
import test from "node:test";
import { initialHeroTitleFit } from "../app/home-shell/hero-title-fit.mjs";

function initialRender(mobile = false) {
  let mutation, onReady, disconnected = false, measurements = 0;
  const text = {
    textContent: "A long adventure title",
    style: { fontSize: "80px", removeProperty() { delete this.fontSize; } },
    get scrollHeight() { measurements++; return parseFloat(this.style.fontSize) * 2; },
    get scrollWidth() { return 300; },
  };
  const heading = { firstElementChild: null, clientHeight: 100, clientWidth: 400 };
  const document = {
    documentElement: {},
    querySelector: () => heading,
    addEventListener: (event, callback) => { assert.equal(event, "DOMContentLoaded"); onReady = callback; },
  };
  runInNewContext(initialHeroTitleFit, {
    document,
    MutationObserver: class {
      constructor(callback) { mutation = callback; }
      observe() {}
      disconnect() { disconnected = true; }
    },
    getComputedStyle: () => ({
      fontSize: "80px", fontStyle: "normal", fontWeight: "800", fontFamily: "Inter",
      letterSpacing: "-4px", getPropertyValue: () => mobile ? "none" : "",
    }),
  });
  return { heading, text, mutation, onReady, disconnected: () => disconnected,
    measurements: () => measurements };
}

test("streamed desktop titles fit before hydration, waiting for their text", () => {
  const page = initialRender();
  page.mutation();
  assert.equal(page.disconnected(), false);
  page.heading.firstElementChild = page.text;
  page.mutation();
  assert.equal(page.disconnected(), true);
  assert.ok(parseFloat(page.text.style.fontSize) <= 50);
  assert.ok(parseFloat(page.text.style.fontSize) > 49);
  const measurements = page.measurements();
  page.mutation();
  assert.equal(page.measurements(), measurements, "hydration must reuse the first fit");
});

test("CSS disables title fitting on mobile before hydration", () => {
  const page = initialRender(true);
  page.heading.firstElementChild = page.text;
  page.mutation();
  assert.equal(page.text.style.fontSize, undefined);
  assert.equal(page.measurements(), 0);
  assert.equal(page.disconnected(), true);
});

test("pages without a hero release the initial observer after parsing", () => {
  const page = initialRender();
  page.onReady();
  assert.equal(page.disconnected(), true);
});
