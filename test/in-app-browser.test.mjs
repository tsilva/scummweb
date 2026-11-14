import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import swc from "next/dist/build/swc/index.js";
import { isInAppBrowser, externalBrowserHref } from "../app/in-app-browser.mjs";

const require = createRequire(import.meta.url);
const { NextRequest } = require("next/server");
const { unstable_doesMiddlewareMatch: doesProxyMatch, isRewrite, getRewrittenUrl } = require("next/experimental/testing/server");
await swc.loadBindings();
async function compile(path, imports) {
  const url = new URL(path, import.meta.url);
  const { code } = await swc.transform(await readFile(url, "utf8"), {
    filename: url.pathname, swcrc: false, configFile: false, module: { type: "commonjs" },
    jsc: { parser: { syntax: "ecmascript", jsx: true }, transform: { react: { runtime: "automatic" } } },
  });
  return (globals = {}) => {
    const module = { exports: {} };
    runInNewContext(code, { module, exports: module.exports, URL, require: name => imports[name] ?? require(name), ...globals });
    return module.exports;
  };
}
const proxyModule = (await compile("../proxy.js", { "./app/in-app-browser.mjs": { isInAppBrowser } }))();

test("explicit in-app signatures and Android webviews are recognized", () => {
  for (const signature of ["[FBAN/FBIOS;FBAV/490]", "[FBAN/FB4A;FBAV/490]", "[FBAN/MessengerForiOS]", "FB_IAB/FB4A", "Instagram 420", "LinkedInApp", "Snapchat/13", "Pinterest/12", "MicroMessenger/8", "TikTok 36", "BytedanceWebview", "musical_ly_202300", "Line/14", "Android 15; Pixel 9 Build/AB; wv)"]) {
    assert.equal(isInAppBrowser(`Mozilla/5.0 ${signature}`), true, signature);
  }
});

test("ordinary browsers, installed apps and link-preview crawlers are not blocked", () => {
  for (const ua of ["", "Mozilla/5.0 (iPhone) Version/18.0 Mobile/15E148 Safari/604.1", "Mozilla/5.0 (iPhone) CriOS/130 Mobile/15E148 Safari/604.1", "Mozilla/5.0 (iPhone) FxiOS/130 Mobile/15E148 Safari/604.1", "Mozilla/5.0 (Android 15) Chrome/130.0 Mobile Safari/537.36", "Mozilla/5.0 (Android 15) SamsungBrowser/27 Chrome/130.0 Mobile Safari/537.36", "Mozilla/5.0 (Macintosh) AppleWebKit/605.1.15", "facebookexternalhit/1.1", "Facebot", "Slackbot-LinkExpanding 1.0", "Twitterbot/1.0"]) {
    assert.equal(isInAppBrowser(ua), false, ua);
  }
});

test("browser intent preserves the full game URL and uses an installed browser", () => {
  const href = "https://scummweb.tsilva.eu/beneath-a-steel-sky/play?edition=cd&launch_from=library#continue";
  const intent = externalBrowserHref(href, "Android 15; wv)");
  assert.ok(intent.startsWith("intent://scummweb.tsilva.eu/beneath-a-steel-sky/play?edition=cd&launch_from=library#continue#Intent;scheme=https;"));
  assert.ok(intent.includes(`S.browser_fallback_url=${encodeURIComponent(href)};end`));
  assert.ok(!intent.includes("package="));
  for (const unsafe of ["javascript:alert(1)", "intent://example.com", "file:///etc/passwd", "https://user:password@example.com", "not a URL"]) {
    assert.equal(externalBrowserHref(unsafe, "Android"), null);
  }
  assert.equal(externalBrowserHref(href, "iPhone"), null);
  assert.equal(externalBrowserHref(href, "Brave"), null);
});

test("proxy covers entry pages and legacy launches but leaves assets, callbacks and APIs alone", () => {
  for (const url of ["/", "/beneath-a-steel-sky", "/beneath-a-steel-sky/play?edition=cd", "/legacy-play", "/scummvm.html#sky"]) {
    assert.equal(doesProxyMatch({ config: proxyModule.config, nextConfig: {}, url }), true, url);
  }
  for (const url of ["/api/report", "/api", "/_next/static/chunk.js", "/monitoring", "/monitoring/envelope", "/in-app-browser", "/brand/in-app-browser-doorway.webp", "/scummvm.wasm", "/dropbox-callback.html?code=test", "/cloud.html", "/robots.txt", "/sitemap.xml"]) {
    assert.equal(doesProxyMatch({ config: proxyModule.config, nextConfig: {}, url }), false, url);
  }
});

test("in-app requests render only the handoff without redirects or shared caching", () => {
  const original = "https://scummweb.tsilva.eu/beneath-a-steel-sky/play?edition=cd";
  const response = proxyModule.proxy(new NextRequest(original, { headers: { "user-agent": "Instagram 420" } }));
  assert.equal(isRewrite(response), true);
  assert.equal(getRewrittenUrl(response), "https://scummweb.tsilva.eu/in-app-browser");
  assert.equal(response.headers.get("location"), null);
  assert.equal(response.headers.get("cache-control"), "private, no-store");
  assert.equal(response.headers.get("x-robots-tag"), "noindex");
  assert.equal(isRewrite(proxyModule.proxy(new NextRequest(original, { headers: { "user-agent": "Chrome/130" } }))), false);
  assert.equal(isRewrite(proxyModule.proxy(new NextRequest(original, { method: "POST", headers: { "user-agent": "Instagram 420" } }))), false);
});

const screenFactory = await compile("../app/in-app-browser-screen.js", {
  "./in-app-browser.mjs": { externalBrowserHref }, "./styles/in-app-browser.css": {},
  "lucide-react": { Check: "check", Copy: "copy", ExternalLink: "external-link" },
});
function screen({ ua = "iPhone", clipboardFails = false, href = "https://scummweb.tsilva.eu/beneath-a-steel-sky/play?edition=cd#continue" } = {}) {
  const slots = [], effects = new Map(), listeners = new Map(), copies = [];
  let cursor = 0, pending = [];
  const hooks = {
    useState(initial) { const i = cursor++; if (!(i in slots)) slots[i] = initial; return [slots[i], value => { slots[i] = value; }]; },
    useRef(initial) { const i = cursor++; if (!(i in slots)) slots[i] = { current: initial }; return slots[i]; },
    useEffect(run, deps) { const i = cursor++; const previous = effects.get(i); if (!previous || deps.some((v, n) => v !== previous.deps[n])) pending.push(() => { previous?.cleanup?.(); effects.set(i, { deps, cleanup: run() }); }); },
  };
  const window = { location: { href }, addEventListener: (name, fn) => listeners.set(name, fn), removeEventListener: name => listeners.delete(name) };
  const module = screenFactory({ window, navigator: { userAgent: ua, clipboard: { writeText: async value => { if (clipboardFails) throw Error("denied"); copies.push(value); } } }, require: name => name === "react" ? hooks : name === "react/jsx-runtime" ? require(name) : name === "./in-app-browser.mjs" ? { externalBrowserHref } : name === "lucide-react" ? { Check: "check", Copy: "copy", ExternalLink: "external-link" } : {} });
  function render() { cursor = 0; pending = []; const tree = module.default(); for (const effect of pending) effect(); return tree; }
  render();
  return { render, copies, window, listeners, unmount() { for (const effect of effects.values()) effect.cleanup?.(); } };
}
function find(tree, predicate) {
  if (!tree || typeof tree !== "object") return null;
  if (predicate(tree)) return tree;
  for (const child of [tree.props?.children].flat(Infinity)) { const result = find(child, predicate); if (result) return result; }
  return null;
}

test("iPhone open action focuses manual instructions and explains the fallback", () => {
  const fixture = screen();
  const tree = fixture.render();
  let focused = false, prevented = false;
  find(tree, n => n.type === "h2").props.ref.current = { focus() { focused = true; } };
  find(tree, n => n.type === "a").props.onClick({ preventDefault() { prevented = true; } });
  assert.equal(prevented && focused, true);
  assert.match(find(fixture.render(), n => n.props?.id === "browser-handoff-help").props.children, /use its menu/);
  fixture.unmount();
  assert.equal(fixture.listeners.size, 0);
});

test("copy includes the original game URL and clipboard denial exposes a selected manual link", async () => {
  const fixture = screen();
  await find(fixture.render(), n => n.type === "button").props.onClick();
  assert.equal(fixture.copies[0], fixture.window.location.href);
  assert.ok(find(fixture.render(), n => n.type === "button").props.children.includes("Link copied"));
  const denied = screen({ clipboardFails: true });
  await find(denied.render(), n => n.type === "button").props.onClick();
  const input = find(denied.render(), n => n.type === "input");
  assert.equal(input.props.value, denied.window.location.href);
  assert.equal(input.props.readOnly, true);
});

test("Android button is a gesture-driven intent and fragment changes refresh the copied link", async () => {
  const fixture = screen({ ua: "Android" });
  const anchor = find(fixture.render(), n => n.type === "a");
  assert.ok(anchor.props.href.startsWith("intent:"));
  anchor.props.onClick({ preventDefault() { assert.fail("Android intent should be followed"); } });
  fixture.window.location.href = "https://scummweb.tsilva.eu/#slide=sky";
  fixture.listeners.get("hashchange")();
  await find(fixture.render(), n => n.type === "button").props.onClick();
  assert.equal(fixture.copies[0], fixture.window.location.href);
});
