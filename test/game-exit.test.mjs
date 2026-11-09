import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createContext, runInContext } from "node:vm";
import test from "node:test";

const html = readFileSync(new URL("../scummvm-shell/scummvm.html", import.meta.url), "utf8");
const exitScript = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)]
  .map((match) => match[1]).find((source) => source.includes("const exitTo="));
// Exercise the generated exit bridge without starting the renderer/input shims.
const bridge = exitScript.slice(0, exitScript.indexOf('const scummwebMessageSource=')) +
  exitScript.slice(exitScript.indexOf("window.Module=window.Module||{};"));

function player({ exitTo = "/#slide=sky", embedded = true, parentThrows = false, local = false } = {}) {
  const messages = [];
  const navigations = [];
  const timers = new Map();
  const canvas = { style: {} };
  let timerId = 0;
  const launchUrl = new URL("https://example.test/scummvm.html#sky");
  if (exitTo !== null) launchUrl.searchParams.set("exitTo", exitTo);
  const context = createContext({
    URL, URLSearchParams, scummwebLaunchUrl: launchUrl,
    isLocalGame: local, isCatalogArchive: false,
    document: { getElementById: () => canvas },
    location: { replace: (href) => navigations.push(href) },
    setTimeout: (callback) => { timers.set(++timerId, callback); return timerId; },
    clearTimeout: (id) => timers.delete(id),
    Module: {},
  });
  context.window = context;
  context.parent = embedded ? { postMessage(message, origin) {
    if (parentThrows) throw new Error("Detached parent");
    messages.push({ ...message, origin });
  } } : context;
  runInContext(bridge, context);
  return { context, canvas, messages, navigations, timers, flush() {
    for (const [id, callback] of timers) { timers.delete(id); callback(); }
  } };
}

test("native exit hides the canvas synchronously and returns home without any user input", () => {
  const session = player();
  session.context.__scummvmRequestExit(0);
  assert.equal(session.canvas.style.visibility, "hidden");
  assert.deepEqual(session.messages, [], "navigation waits for native cleanup");
  session.flush();
  assert.deepEqual(session.messages, [{ type: "scummvm-exit", href: "/#slide=sky", status: 0, origin: "https://example.test" }]);
});

test("launcher interception and subsequent native teardown only send one exit", () => {
  const session = player();
  session.context.__scummvmRequestExit(0);
  session.context.__scummvmRequestExit(0);
  assert.equal(session.timers.size, 1);
  session.flush();
  session.context.__scummvmRequestExit(0);
  session.flush();
  assert.equal(session.messages.length, 1);
  assert.equal(session.timers.size, 0);
});

test("legacy quit callback also exits without Escape or interaction heuristics", () => {
  const session = player();
  const error = new Error("ExitStatus");
  assert.throws(() => session.context.Module.quit(0, error), (caught) => caught === error);
  assert.equal(session.canvas.style.visibility, "hidden");
  session.flush();
  assert.equal(session.messages.length, 1);
});

for (const options of [{ embedded: false }, { parentThrows: true }]) {
  test(`exit navigates directly when ${options.embedded === false ? "standalone" : "parent messaging fails"}`, () => {
    const session = player(options);
    session.context.__scummvmRequestExit(0);
    session.flush();
    assert.deepEqual(session.navigations, ["/#slide=sky"]);
  });
}

test("exit destinations remain same-origin and imported games default home", () => {
  for (const options of [{ exitTo: "https://untrusted.test/" }, { exitTo: null, local: true }]) {
    const session = player(options);
    session.context.__scummvmRequestExit(0);
    session.flush();
    assert.equal(session.messages[0].href, "/");
  }
});

test("bridge-free build utilities retain control of runtime termination", () => {
  const session = player({ exitTo: null });
  assert.equal(session.context.__scummvmRequestExit, undefined);
});
