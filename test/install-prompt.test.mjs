import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import swc from "next/dist/build/swc/index.js";
import { installPromptStartup } from "../app/home-shell/install-prompt-startup.mjs";

await swc.loadBindings();
const url = new URL("../app/home-shell/install-prompt.js", import.meta.url);
const require = createRequire(url);
const source = await readFile(url, "utf8");
assert.ok(source.includes('import("./install-prompt-styles")'));
const { code } = await swc.transform(source.replace('import("./install-prompt-styles")', '__loadStyles()'), {
  filename: url.pathname, swcrc: false, configFile: false, module: { type: "commonjs" },
  jsc: { parser: { syntax: "ecmascript", jsx: true }, transform: { react: { runtime: "automatic" } } },
});
const tick = () => new Promise(resolve => setImmediate(resolve));
const visitsKey = "scummweb.install-prompt-visits";
function fixture({ available = false, pathname = "/", standalone = false, embedded = false,
  userAgent = "Brave", touch = 0, visits = 2, store = new Map([[visitsKey, String(visits)]]), storageError = false } = {}) {
  const listeners = new Map(), slots = [], effects = new Map(), reports = [], calls = [];
  let cursor = 0, pending = [], mounted = true, invalidUpdates = 0, gesture = false, styleRequests = 0;
  let resolveStyles, rejectStyles;
  const styles = new Promise((resolve, reject) => { resolveStyles = resolve; rejectStyles = reject; });
  const prompt = { prompt() { calls.push({ gesture }); return Promise.resolve(); } };
  const window = {
    isSecureContext: true, localStorage: {
      getItem: key => { if (storageError) throw new Error("Storage unavailable"); return store.get(key); },
      setItem: (key, value) => { if (storageError) throw new Error("Storage unavailable"); store.set(key, value); },
    },
    matchMedia: () => ({ matches: standalone, addEventListener() {}, removeEventListener() {} }),
    addEventListener(name, handler) { if (!listeners.has(name)) listeners.set(name, new Set()); listeners.get(name).add(handler); },
    removeEventListener(name, handler) { listeners.get(name)?.delete(handler); },
  };
  window.top = embedded ? {} : window;
  const dispatch = (name, event = {}) => { for (const f of listeners.get(name) ?? []) f(event); };
  runInNewContext(installPromptStartup, { window });
  if (available) dispatch("beforeinstallprompt", prompt);
  const hooks = {
    useState(initial) {
      const i = cursor++; if (!(i in slots)) slots[i] = initial;
      return [slots[i], value => { if (!mounted) invalidUpdates++; slots[i] = typeof value === "function" ? value(slots[i]) : value; }];
    },
    useRef(initial) { const i = cursor++; if (!(i in slots)) slots[i] = { current: initial }; return slots[i]; },
    useEffect(run, deps) {
      const i = cursor++, previous = effects.get(i);
      if (!previous || deps.some((value, n) => !Object.is(value, previous.deps[n]))) pending.push(() => {
        previous?.cleanup?.(); effects.set(i, { deps: [...deps], cleanup: run() });
      });
    },
  };
  const compiled = { exports: {} };
  runInNewContext(code, { window, navigator: { userAgent, maxTouchPoints: touch, standalone },
    module: compiled, exports: compiled.exports,
    __loadStyles() { styleRequests++; return styles; },
    require(name) {
      if (name === "react") return hooks;
      if (name === "react/jsx-runtime") return require(name);
      if (name === "lucide-react") return { X: () => null };
      if (name === "next/navigation") return { usePathname: () => pathname };
      if (name === "@sentry/nextjs") return { captureException: error => reports.push(error.message) };
      throw new Error(`Unexpected import ${name}`);
    },
  });
  function render() { cursor = 0; pending = []; const tree = compiled.exports.default(); const work = pending; pending = []; work.forEach(run => run()); return tree; }
  return { render, resolveStyles, rejectStyles, reports, calls, store,
    offer() { dispatch("beforeinstallprompt", prompt); }, installed() { dispatch("appinstalled"); },
    dismissElsewhere() {
      store.set("scummweb.install-prompt-dismissed", "1");
      dispatch("storage", { key: "scummweb.install-prompt-dismissed", newValue: "1" });
    },
    remount() { effects.forEach(effect => effect.cleanup?.()); effects.clear(); slots.length = 0; mounted = true; },
    unmount() { effects.forEach(effect => effect.cleanup?.()); mounted = false; },
    click(button) { gesture = true; const result = button.props.onClick(); gesture = false; return result; },
    get styleRequests() { return styleRequests; }, get invalidUpdates() { return invalidUpdates; },
  };
}
function find(node, predicate) {
  if (!node || typeof node !== "object") return undefined;
  if (predicate(node)) return node;
  const children = node.props?.children;
  for (const child of Array.isArray(children) ? children : [children]) { const result = find(child, predicate); if (result) return result; }
}
const content = node => typeof node === "string" ? node : Array.isArray(node) ? node.map(content).join(" ") : node?.props ? content(node.props.children) : "";
async function ready(f) { f.render(); f.render(); f.resolveStyles(); await tick(); return f.render(); }

test("installation is hidden for two visits, available from the third, and never returns after dismissal", async () => {
  const store = new Map();
  for (let visit = 1; visit <= 5; visit++) {
    const f = fixture({ available: true, store });
    const tree = await ready(f);
    assert.equal(store.get(visitsKey), String(Math.min(visit, 3)));
    if (visit < 3 || visit === 5) {
      assert.equal(tree, null);
      assert.equal(f.styleRequests, 0);
      f.offer(); assert.equal(f.render(), null);
    } else {
      assert.equal(tree.type, "aside");
      if (visit === 4) f.click(find(tree, n => n.props?.["aria-label"] === "Dismiss install invitation"));
    }
    f.unmount();
  }
});
test("rerenders and remounts in one document do not advance the visit count", async () => {
  const f = fixture({ available: true, visits: 0 });
  assert.equal(await ready(f), null);
  f.remount();
  assert.equal(await ready(f), null);
  assert.equal(f.store.get(visitsKey), "1");
  f.unmount();
});
test("Safari also waits for the third visit, and unavailable storage keeps invitations hidden", async () => {
  for (const options of [
    { userAgent: "iPhone Version/17 Safari/1", visits: 0 },
    { userAgent: "Macintosh Version/17 Safari/1", visits: 1 },
    { available: true, storageError: true },
  ]) {
    const f = fixture(options);
    assert.equal(await ready(f), null); assert.equal(f.styleRequests, 0); f.unmount();
  }
});
test("dismissal in another tab hides the invitation and prevents later offers", async () => {
  const f = fixture({ available: true });
  assert.equal((await ready(f)).type, "aside");
  f.dismissElsewhere(); assert.equal(f.render(), null);
  f.offer(); assert.equal(f.render(), null); f.unmount();
});

test("ineligible visits request no invitation CSS; late eligibility waits for styles", async () => {
  const f = fixture(); assert.equal(f.render(), null); f.render(); assert.equal(f.styleRequests, 0);
  f.offer(); assert.equal(f.render(), null); assert.equal(f.styleRequests, 1);
  f.resolveStyles(); await tick(); assert.equal(f.render().type, "aside"); f.unmount();
});
test("an offer captured before hydration retains the install click gesture", async () => {
  const f = fixture({ available: true }); const tree = await ready(f);
  const button = find(tree, n => n.type === "button" && content(n) === "Install app");
  await f.click(button); assert.deepEqual(f.calls, [{ gesture: true }]); assert.equal(f.render(), null);
  f.offer(); assert.equal(f.render(), null); f.unmount();
});
test("failed styles report once and preserve install/dismiss controls and persisted dismissal", async () => {
  const f = fixture({ available: true }); f.render(); f.render(); f.rejectStyles(new Error("Synthetic style failure")); await tick();
  const tree = f.render(); assert.equal(tree.type, "aside"); assert.deepEqual(f.reports, ["Synthetic style failure"]);
  f.render(); assert.equal(f.styleRequests, 1);
  f.click(find(tree, n => n.props?.["aria-label"] === "Dismiss install invitation")); assert.equal(f.render(), null); f.unmount();
  const returning = fixture({ available: true, store: f.store }); returning.render(); returning.render(); assert.equal(returning.styleRequests, 0); returning.unmount();
});
test("standalone, embedded and non-home visits do not load invitation styles", () => {
  for (const options of [{standalone:true},{embedded:true},{pathname:"/game"}]) {
    const f = fixture({ available: true, ...options }); f.render(); assert.equal(f.render(), null); assert.equal(f.styleRequests, 0); f.unmount();
  }
});
test("appinstalled hides the offer and a pending load cannot update an unmounted prompt", async () => {
  const f = fixture({ available: true }); f.render(); f.render(); f.installed(); assert.equal(f.render(), null); f.unmount(); f.resolveStyles(); await tick(); assert.equal(f.invalidUpdates, 0);
});
test("Safari instructions remain available without native installation", async () => {
  for (const [userAgent, expected] of [["iPhone Version/17 Safari/1", "Add to Home Screen"],["Macintosh Version/17 Safari/1", "Add to Dock"]]) {
    const f = fixture({ userAgent }); const tree = await ready(f); assert.ok(content(tree).includes(expected)); assert.equal(find(tree, n => n.type === "button" && content(n) === "Install app"), undefined); f.unmount();
  }
});
