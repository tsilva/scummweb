import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import test from "node:test";
import swc from "next/dist/build/swc/index.js";
import * as review from "../app/dropbox/conflict-review.mjs";
import { connectionKey } from "../app/dropbox/client.mjs";
import { renderToStaticMarkup } from "react-dom/server";

const nativeRequire = createRequire(import.meta.url);
await swc.loadBindings();
async function component(path, imports, react) {
  const url = new URL(path, import.meta.url);
  const { code } = await swc.transform(await readFile(url, "utf8"), { filename: url.pathname, swcrc: false, configFile: false,
    module: { type: "commonjs" }, jsc: { parser: { syntax: "ecmascript", jsx: true }, transform: { react: { runtime: "automatic" } } } });
  const compiled = { exports: {} };
  runInNewContext(code, { module: compiled, exports: compiled.exports,
    window: imports.window, Event,
    require: (name) => name === "react" ? react : name === "react/jsx-runtime" ? nativeRequire(name) : imports[name] });
  return compiled.exports.default;
}
function nodes(root) {
  if (!root || typeof root !== "object") return [];
  return [root, ...[root.props?.children].flat(Infinity).flatMap(nodes)];
}
const text = (node) => typeof node === "string" || typeof node === "number" ? String(node)
  : !node || typeof node !== "object" ? "" : [node.props?.children].flat(Infinity).map(text).join("");
const button = (root, name) => nodes(root).find((node) => node.type === "button" && text(node) === name);
const conflicts = ["Beneath a Steel Sky", "Flight of the Amazon Queen"].map((title, index) => ({ profile: "profile-" + index, title,
  local: { hash: "local-" + index, files: [{}, {}] }, remote: { hash: "remote-" + index, files: [{}] },
  remoteHash: "remote-" + index, tips: ["tip-" + index], canResolve: index === 0 }));

test("bulk review collects locked and unlocked games, waits only for local acceptance, then closes", async () => {
  let accept, acceptedChoices, closed = 0, cursor = 0;
  const durable = new Promise((resolve) => { accept = resolve; });
  const runtime = { queueDropboxConflictResolutions(choices) { acceptedChoices = structuredClone(choices); return durable; } };
  const state = [runtime, { phase: "conflict", conflicts }, {}, false, "", ""];
  const panel = { close() { closed++; }, showModal() {} };
  const View = await component("../app/dropbox-save-sync.js", {
    "./dropbox/bridge.mjs": { dropboxEnabled: () => true }, "./dropbox/conflict-review.mjs": review,
  }, { useEffect() {}, useRef: () => ({ current: panel }), useState(initial) {
    const index = cursor++; if (!(index in state)) state[index] = initial;
    return [state[index], (value) => { state[index] = typeof value === "function" ? value(state[index]) : value; }];
  } });
  const render = () => { cursor = 0; return View(); };
  let tree = render();
  assert.equal(nodes(tree).filter(({ type }) => type === "fieldset").length, 2);
  assert.equal(button(tree, "Apply choices").props.disabled, true);
  nodes(tree).filter(({ type }) => type === "input")[0].props.onChange();
  tree = render(); assert.equal(button(tree, "Apply choices").props.disabled, true);
  nodes(tree).filter(({ type }) => type === "input")[3].props.onChange();
  tree = render(); assert.equal(button(tree, "Apply choices").props.disabled, false);
  const submitted = button(tree, "Apply choices").props.onClick();
  tree = render();
  assert.equal(button(tree, "Apply choices").props.disabled, true);
  assert.equal(text(tree).includes("Saving"), false);
  assert.equal(closed, 0, "do not dismiss before the local durable write succeeds");
  accept(); await submitted;
  assert.equal(closed, 1, "cloud publication is not awaited by the dialog");
  assert.deepEqual(acceptedChoices.map(({ choice }) => choice), ["local", "remote"]);
  assert.equal(text(render()).includes("1 save file"), true);
});

test("a refreshed game invalidates just that game's existing radio choice", async () => {
  let cursor = 0;
  const choices = Object.fromEntries(conflicts.map((conflict) => [conflict.profile, { choice: "local", version: review.conflictVersion(conflict) }]));
  const fresh = structuredClone(conflicts); fresh[1].tips.push("a-new-tip");
  const state = [null, { phase: "conflict", conflicts: fresh }, choices, false, "", ""];
  const View = await component("../app/dropbox-save-sync.js", {
    "./dropbox/bridge.mjs": { dropboxEnabled: () => true }, "./dropbox/conflict-review.mjs": review,
  }, { useEffect() {}, useRef: () => ({ current: null }), useState() { const index = cursor++; return [state[index], () => {}]; } });
  const tree = View(), inputs = nodes(tree).filter(({ type }) => type === "input");
  assert.equal(inputs[0].props.checked, true);
  assert.equal(inputs[2].props.checked, false); assert.equal(inputs[3].props.checked, false);
  assert.equal(button(tree, "Apply choices").props.disabled, true);
});

test("review shows actual conflicting files even when sizes and dates match, and distinguishes compatible changes", async () => {
  const conflict = { ...conflicts[0], others: [{ hash: "third", files: [{}] }], identical: 2,
    differences: [
      { path: "SKY-VM.001", conflict: true, reason: "Different contents",
        versions: Array.from({ length: 3 }, () => ({ path: "SKY-VM.001", size: 2048, modifiedAt: 1730000000000 })) },
      { path: "SKY-VM.002", conflict: true, reason: "Deleted in one copy, changed in another",
        versions: [null, { path: "SKY-VM.002", size: 512, modifiedAt: 1730000000000 }, null] },
      { path: "SKY-VM.003", conflict: false, reason: "Combined automatically",
        versions: [{ path: "SKY-VM.003", size: 1024, modifiedAt: 1730000000000 }, null, null] },
    ] };
  let cursor = 0;
  const state = [null, { phase: "conflict", conflicts: [conflict] }, {}, false, "", ""];
  const View = await component("../app/dropbox-save-sync.js", {
    "./dropbox/bridge.mjs": { dropboxEnabled: () => true }, "./dropbox/conflict-review.mjs": review,
  }, { useEffect() {}, useRef: () => ({ current: null }), useState() { return [state[cursor++], () => {}]; } });
  const tree = View(), html = renderToStaticMarkup(tree);
  assert.equal(nodes(tree).filter(({ type }) => type === "input").length, 3);
  for (const detail of ["SKY-VM.001", "Different contents", "2,048 bytes", "Deleted in one copy, changed in another", "Absent",
    "Other changes kept with either choice (1)", "Combined automatically", "2 identical files kept.", "Other saved copy 1", "<time"]) assert.ok(html.includes(detail), detail);
});

test("reordered additional copies invalidate choices even when the same cloud tips are listed", () => {
  const conflict = { ...conflicts[0], others: [{ hash: "third" }, { hash: "fourth" }] };
  const reordered = { ...conflict, others: [...conflict.others].reverse() };
  assert.notEqual(review.conflictVersion(conflict), review.conflictVersion(reordered));
});

test("postponed review identity follows copies and tips, independently of listing order", () => {
  const original = structuredClone(conflicts);
  original[0].others = [{ hash: "third" }, { hash: "fourth" }];
  original[0].tips.push("another-tip");
  const reordered = structuredClone(original).reverse();
  reordered[1].others.reverse(); reordered[1].tips.reverse();
  [reordered[1].local, reordered[1].remote] = [reordered[1].remote, reordered[1].local];
  reordered[1].remoteHash = reordered[1].remote.hash;
  assert.equal(review.conflictReviewId(original), review.conflictReviewId(reordered));
  reordered[1].tips.push("new-cloud-tip");
  assert.notEqual(review.conflictReviewId(original), review.conflictReviewId(reordered));
  reordered[1].tips.pop(); reordered[1].local.hash = "changed-save";
  assert.notEqual(review.conflictReviewId(original), review.conflictReviewId(reordered));
});

function reviewWindow(account = "account-a") {
  const values = new Map([[connectionKey, JSON.stringify({ accountId: account })]]);
  return Object.assign(new EventTarget(), { localStorage: {
    getItem(key) { return values.get(key) ?? null; },
    setItem(key, value) { values.set(key, value); },
  } });
}

test("postponement is scoped to the connected account and tolerates unavailable preferences", () => {
  const { localStorage: storage } = reviewWindow();
  review.rememberDismissedConflictReview(storage, "review-a");
  assert.equal(review.readDismissedConflictReview(storage), "review-a");
  storage.setItem(connectionKey, JSON.stringify({ accountId: "account-b" }));
  assert.equal(review.readDismissedConflictReview(storage), "");
  storage.setItem(review.conflictDismissalKey, "invalid JSON");
  assert.equal(review.readDismissedConflictReview(storage), "");
  const denied = { getItem() { throw Error("denied"); }, setItem() { throw Error("denied"); } };
  assert.equal(review.readDismissedConflictReview(denied), "");
  assert.doesNotThrow(() => review.rememberDismissedConflictReview(denied, "review-a"));
  assert.doesNotThrow(() => review.rememberDismissedConflictReview(null, "review-a"));
});

async function mountReview(window, currentConflicts = conflicts) {
  let cursor, effectCursor, pending;
  const state = [null, { phase: "conflict", conflicts: currentConflicts }];
  const effects = [];
  const panel = { open: false, showModal() { this.open = true; }, close() { this.open = false; } };
  const View = await component("../app/dropbox-save-sync.js", {
    window, "./dropbox/client.mjs": { connectionKey },
    "./dropbox/bridge.mjs": { dropboxEnabled: () => false }, "./dropbox/conflict-review.mjs": review,
  }, {
    useRef: () => ({ current: panel }),
    useState(initial) {
      const index = cursor++;
      if (!(index in state)) state[index] = typeof initial === "function" ? initial() : initial;
      return [state[index], (value) => { state[index] = typeof value === "function" ? value(state[index]) : value; }];
    },
    useEffect(run, deps) {
      const index = effectCursor++, old = effects[index];
      if (!old || deps.some((value, i) => !Object.is(value, old.deps[i]))) {
        pending.push(() => { old?.cleanup?.(); effects[index] = { deps, cleanup: run() }; });
      }
    },
  });
  return { panel,
    render(nextConflicts) {
      if (nextConflicts) state[1] = { phase: "conflict", conflicts: nextConflicts };
      cursor = 0; effectCursor = 0; pending = [];
      const tree = View(); for (const run of pending) run(); return tree;
    },
    unmount() { for (const effect of effects) effect.cleanup?.(); },
  };
}

test("Decide later survives a new page, reload and reordered review; manual review and new tips still open", async () => {
  const window = reviewWindow(), first = await mountReview(window);
  button(first.render(), "Decide later").props.onClick(); first.render();
  assert.equal(first.panel.open, false); first.unmount();
  const next = await mountReview(window, [...conflicts].reverse()); next.render();
  assert.equal(next.panel.open, false, "navigation must not repeat an unchanged review");
  window.dispatchEvent(new Event("scummweb:dropbox-review")); next.render();
  assert.equal(next.panel.open, true, "Dropbox row explicitly reopens review in this tab");
  next.unmount();
  const reload = await mountReview(window); reload.render();
  assert.equal(reload.panel.open, false, "explicit review does not erase the saved dismissal");
  const changed = structuredClone(conflicts); changed[0].tips.push("new-cloud-tip"); reload.render(changed);
  assert.equal(reload.panel.open, true, "a new cloud version needs a fresh review"); reload.unmount();
});

test("another tab's postponement closes its matching review, and account changes do not inherit it", async () => {
  const window = reviewWindow(), mounted = await mountReview(window); mounted.render();
  assert.equal(mounted.panel.open, true);
  review.rememberDismissedConflictReview(window.localStorage, review.conflictReviewId(conflicts));
  window.dispatchEvent(Object.assign(new Event("storage"), { key: review.conflictDismissalKey })); mounted.render();
  assert.equal(mounted.panel.open, false);
  window.localStorage.setItem(connectionKey, JSON.stringify({ accountId: "account-b" }));
  window.dispatchEvent(new Event("scummweb:dropbox-connection")); mounted.render();
  assert.equal(mounted.panel.open, true); mounted.unmount();
});

async function row(state, initialNotice = "") {
  let syncCalls = 0, reviews = 0, cursor = 0;
  const Icon = () => null;
  const Row = await component("../app/home-shell/dropbox-row.js", {
    "lucide-react": { Check: Icon, LoaderCircle: Icon, Unplug: Icon },
    "../dropbox/runtime.mjs": { getDropboxState: () => state, subscribeDropbox() {}, dropboxConfigured: () => true,
      async syncDropbox() { syncCalls++; }, async connectDropbox() {}, async disconnectDropbox() {} },
    window: { dispatchEvent(event) { if (event.type === "scummweb:dropbox-review") reviews++; } },
  }, { useSyncExternalStore: () => state, useEffect() {}, useState() { return [cursor++ === 0 ? false : initialNotice, () => {}]; } });
  return { tree: Row(), calls: () => ({ syncCalls, reviews }) };
}

test("opening conflict review starts no competing cloud sync", async () => {
  const { tree, calls } = await row({ phase: "conflict", message: "Choose which saved progress to continue.", conflicts });
  await nodes(tree).find(({ props }) => props?.className === "dropbox-connect").props.onClick();
  assert.deepEqual(calls(), { syncCalls: 0, reviews: 1 });
});

for (const phase of ["connecting", "syncing", "resolving"]) test(`${phase} never shows an obsolete choose-progress message`, async () => {
  const { tree } = await row({ phase, message: "Choose which saved progress to continue.", conflicts,
    resolutionProgress: { current: 1, total: 2 } }, "Choose which saved progress to continue.");
  assert.equal(nodes(tree).some(({ props }) => props?.className === "dropbox-notice"), false);
  if (phase === "resolving") assert.match(text(tree), /Applying choices \(1\/2\)/);
});
