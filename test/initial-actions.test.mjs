import assert from "node:assert/strict";
import test from "node:test";
import { runInNewContext } from "node:vm";
import { initialActionState, initialActionsScript, prepareInitialActions } from "../app/home-shell/initial-actions.mjs";

const game = { target: "sky", engineId: "sky", gameId: "sky", playHref: "/beneath-a-steel-sky/play",
  infoHref: "/launcher/notices/sky.txt" };
const catalog = { key: "catalog:sky", game };
const descriptor = () => initialActionState("sky:sky:full", catalog, [catalog], "runtime-test");

function fixture(t, state = descriptor()) {
  const values = new Map();
  const storage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
  function node() {
    return { textContent: "", hidden: false, attributes: {}, classList: { add() {}, toggle() {} },
      setAttribute(key, value) { this.attributes[key] = value; },
      removeAttribute(key) { delete this.attributes[key]; if (key === "href") delete this.href; } };
  }
  const primary = node(), restart = node(), browse = node(), license = node(), options = [];
  const chooser = { removeAttribute() {}, querySelector: () => ({ append: option => options.push(option) }) };
  const container = { dataset: { initialActions: JSON.stringify(state), entryPoint: "game_detail" },
    parentElement: { querySelector: () => ({ innerHTML: "server controls", nextElementSibling: {} }) },
    querySelector: selector => ({ ".launch-button": primary, ".start-fresh-button": restart,
      ".browse-games-button": browse,
      ".hero-license": license, ".hero-version-control": chooser })[selector] };
  const priorWindow = globalThis.window, priorDocument = globalThis.document;
  t.after(() => {
    if (priorWindow === undefined) delete globalThis.window; else globalThis.window = priorWindow;
    if (priorDocument === undefined) delete globalThis.document; else globalThis.document = priorDocument;
  });
  globalThis.window = { localStorage: storage, location: { origin: "https://example.test" } };
  globalThis.document = { createElement: node };
  return { values, storage, container, primary, restart, browse, license, options };
}

test("first-paint catalog actions use the validated browser index, including slot zero", t => {
  const f = fixture(t);
  prepareInitialActions(f.container, (identity, storage, namespace) => {
    assert.equal(identity.target, "sky"); assert.equal(storage, f.storage); assert.equal(namespace, "");
    return { slot: 0 };
  });
  assert.equal(f.container.dataset.prepared, "true");
  assert.equal(f.primary.textContent, "Continue");
  assert.equal(f.primary.href, "/beneath-a-steel-sky/play?launch_from=game_detail#continue");
  assert.equal(f.restart.hidden, false);
  assert.equal(f.browse.hidden, true);
  assert.equal(f.license.href, "https://example.test/launcher/notices/sky.txt");
});

test("no indexed save shows Play immediately with no restart link", t => {
  const f = fixture(t);
  prepareInitialActions(f.container, () => null);
  assert.equal(f.container.dataset.prepared, "true");
  assert.equal(f.primary.textContent, "Play");
  assert.equal(f.restart.hidden, true);
  assert.equal(f.browse.hidden, false);
  assert.equal(f.browse.href, "#library");
});

test("remembered imports use their own cached identity and wait for access validation before clicks", t => {
  const f = fixture(t);
  const imported = { key: "source:floppy", source: { id: "floppy" }, label: "DOS · Floppy",
    game: { ...game, saveVersionId: "floppy" } };
  const cached = initialActionState("sky:sky:full", imported, [catalog, imported], "runtime-test");
  f.values.set("scummweb.version:sky:sky:full", imported.key);
  f.values.set("scummweb.hero-actions.v1:sky:sky:full", JSON.stringify(cached));
  const namespace = "version-" + "a".repeat(64);
  f.values.set("scummweb.save-namespace.v1:floppy", namespace);
  prepareInitialActions(f.container, (identity, storage, selectedNamespace) => {
    assert.equal(identity.saveVersionId, "floppy"); assert.equal(selectedNamespace, namespace);
    return { slot: 2 };
  });
  assert.equal(f.primary.textContent, "Continue");
  assert.equal(f.primary.href, undefined, "the provisional import cannot launch the catalog fallback");
  assert.equal(f.primary.attributes["aria-disabled"], "true");
  assert.equal(f.options.length, 2);
  assert.equal(f.options[1].selected, true);
});

test("unknown or stale remembered editions never expose the catalog's Continue state", t => {
  const f = fixture(t);
  f.values.set("scummweb.version:sky:sky:full", "source:floppy");
  for (const cache of [null, { ...descriptor(), version: "source:floppy", runtimeVersion: "old-runtime" }]) {
    f.values.set("scummweb.hero-actions.v1:sky:sky:full", JSON.stringify(cache));
    prepareInitialActions(f.container, () => assert.fail("must not inspect the wrong copy's saves"));
    assert.equal(f.container.dataset.prepared, undefined);
  }
});

test("a removed preference can immediately use its last verified catalog fallback", t => {
  const f = fixture(t);
  const remembered = "source:removed";
  f.values.set("scummweb.version:sky:sky:full", remembered);
  f.values.set("scummweb.hero-actions.v1:sky:sky:full", JSON.stringify({ ...descriptor(), preference: remembered }));
  prepareInitialActions(f.container, () => ({ slot: 1 }));
  assert.equal(f.primary.textContent, "Continue");
  assert.equal(f.container.dataset.prepared, "true");
});

test("legacy links to another game never show the featured game's cached action", t => {
  const f = fixture(t);
  window.location.hash = "#slide=source%3Acustom";
  prepareInitialActions(f.container, () => assert.fail("must restore the selected game first"));
  assert.equal(f.container.dataset.prepared, undefined);
});

test("changed native identity in an unrecognized import requires reconciliation", t => {
  const f = fixture(t);
  const cached = { ...descriptor(), version: "source:unknown", source: true,
    game: { target: "unknown", saveVersionId: "unknown" }, nativeIdentity: ["lure", "lure", ""] };
  f.values.set("scummweb.version:sky:sky:full", cached.version);
  f.values.set("scummweb.hero-actions.v1:sky:sky:full", JSON.stringify(cached));
  prepareInitialActions(f.container, () => ({ slot: 1, engineId: "agi", gameId: "mickey" }));
  assert.equal(f.container.dataset.prepared, undefined);
});

test("the standalone head script runs without a React bundle or imported closures", t => {
  const f = fixture(t);
  let onMutation, disconnected = false;
  runInNewContext(initialActionsScript, {
    window, URL, atob, DataView, Uint8Array, TextDecoder,
    document: { querySelector: () => f.container, documentElement: {}, addEventListener() {} },
    MutationObserver: class {
      constructor(callback) { onMutation = callback; }
      observe() {} disconnect() { disconnected = true; }
    },
  });
  onMutation();
  assert.equal(f.primary.textContent, "Play");
  assert.equal(f.container.dataset.prepared, "true");
  assert.equal(disconnected, true);
});
