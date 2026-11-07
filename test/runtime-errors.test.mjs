import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import test from "node:test";

const html = readFileSync(new URL("../scummvm-shell/scummvm.html", import.meta.url), "utf8");
const scripts = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)].map((match) => match[1]);
const earlyErrors = scripts.find((script) => script.includes("var reportScummvmBootError"));
const initializer = scripts.find((script) => script.includes("var Module={preRun:"));
const localErrors = scripts.find((script) => script.includes("function reportRuntimeError(error)"));

function shell({ local = false, inline = false } = {}) {
  const classes = new Set();
  const status = { style: {}, innerHTML: "", classList: { add: (name) => classes.add(name) } };
  const listeners = {};
  const localStatuses = [];
  const reports = [];
  const href = "https://example.test/scummvm.html?localGame=1#sky";
  const context = {
    URL, location: new URL(inline ? "about:srcdoc" : href),
    parent: { postMessage: (report, origin) => reports.push({ ...report, origin }) },
    console: { log() {}, error() {} },
    setupFilesystem() {},
    document: { baseURI: href, getElementById: () => ({ value: "", addEventListener() {} }) },
    statusElement: status, progressElement: {},
    isLocalGame: local, localGameStatus: "running",
    reportLocalGameStatus: (value) => localStatuses.push(value),
    addEventListener: (name, callback) => { (listeners[name] ||= []).push(callback); },
    __scummvmRequestExit() {},
  };
  context.window = context;
  runInNewContext(earlyErrors, context);
  runInNewContext(initializer.slice(initializer.indexOf("var Module={preRun:")), context);
  runInNewContext(localErrors, context);
  return { context, status, classes, localStatuses, reports, dispatch(name, event) {
    for (const listener of listeners[name] || []) listener(event);
  } };
}

for (const local of [false, true]) {
  test(`successful runtime exit does not display the JavaScript error banner (${local ? "imported" : "bundled"})`, () => {
    const session = shell({ local });
    const error = { name: "ExitStatus", status: 0, message: "Program terminated with exit(0)" };
    assert.equal(session.context.onerror(error.message, "scummvm.js", 1, 1, error), true);
    session.dispatch("error", { error });
    assert.equal(session.classes.has("error"), false);
    assert.doesNotMatch(session.status.innerHTML, /Exception thrown/);
    assert.deepEqual(session.localStatuses, []);
    assert.deepEqual(session.reports, []);
    session.context.Module.setStatus("Still usable");
    assert.match(session.status.innerHTML, /Still usable/);
  });
}

test("failed exits and ordinary exceptions retain the error banner", () => {
  for (const error of [new TypeError("bad input"), { name: "ExitStatus", status: 1 }, { name: "ExitStatus", status: 130 }, new Error("ExitStatus"), undefined]) {
    const session = shell({ local: true });
    session.context.onerror("Uncaught error", "scummvm.js", 1, 1, error);
    session.dispatch("error", { error });
    assert.equal(session.classes.has("error"), true);
    assert.match(session.status.innerHTML, /Exception thrown/);
    assert.deepEqual(session.localStatuses, ["error"]);
  }
});

test("successful exit rejections are handled without hiding failed rejections", () => {
  const session = shell({ local: true });
  let prevented = 0;
  session.dispatch("unhandledrejection", { reason: { name: "ExitStatus", status: 0 }, preventDefault() { prevented++; } });
  assert.equal(prevented, 1);
  assert.deepEqual(session.localStatuses, []);
  session.dispatch("unhandledrejection", { reason: { name: "ExitStatus", status: 2 }, preventDefault() { prevented++; } });
  assert.equal(prevented, 1);
  assert.deepEqual(session.localStatuses, ["error"]);
});

for (const status of [0, 130]) {
  test(`page teardown handles expected runtime status ${status} without the banner`, () => {
    const session = shell({ local: true });
    session.dispatch("beforeunload", {});
    const error = { name: "ExitStatus", status };
    assert.equal(session.context.onerror("Uncaught", "scummvm.js", 1, 1, error), true);
    session.dispatch("error", { error });
    let prevented = false;
    session.dispatch("unhandledrejection", { reason: error, preventDefault() { prevented = true; } });
    assert.equal(prevented, true);
    assert.equal(session.classes.has("error"), false);
    assert.deepEqual(session.localStatuses, []);
    assert.deepEqual(session.reports, []);
  });
}

test("unloading still reports genuine runtime failures", () => {
  for (const error of [new TypeError("cleanup failed"), { name: "ExitStatus", status: 1 }]) {
    const session = shell({ local: true });
    session.dispatch("beforeunload", {});
    session.context.onerror("Uncaught", "scummvm.js", 1, 1, error);
    session.dispatch("error", { error });
    assert.equal(session.classes.has("error"), true);
    assert.deepEqual(session.localStatuses, ["error"]);
  }
});

test("reports an early shell error from an inline retry once, without waiting for the runtime", () => {
  const session = shell({ inline: true });
  session.dispatch("error", { message: "Unexpected token '?'", error: new SyntaxError("Unexpected token '?'") });
  session.context.Module.onAbort("Wasm aborted");
  assert.deepEqual(session.reports, [{
    type: "scummvm-boot-error", href: "https://example.test/scummvm.html?localGame=1#sky",
    stage: "script-error", name: "SyntaxError", message: "Unexpected token '?'", origin: "https://example.test",
  }]);
});

test("reports a failed runtime script load without including the asset URL", () => {
  const session = shell();
  session.dispatch("error", { target: { tagName: "IMG", src: "/favicon.svg" } });
  session.dispatch("error", { target: { tagName: "SCRIPT", src: "https://example.test/scummvm.js?v=hash" } });
  assert.equal(session.reports.length, 1);
  assert.equal(session.reports[0].stage, "script-load");
  assert.equal(session.reports[0].message, "scummvm.js");
});

test("classifies native game detection without forwarding engine output", () => {
  const session = shell({ local: true });
  session.context.Module.printErr("No game data was found in /local-game/private-file");
  assert.equal(session.reports[0].stage, "game-detection");
  assert.equal(session.reports[0].message, "");
});

test("reports Wasm aborts during startup only", () => {
  const startup = shell();
  startup.context.Module.onAbort("Wasm aborted");
  assert.equal(startup.reports[0].stage, "runtime-abort");
  const running = shell();
  running.context.__scummwebReadyState = { state: "ready" };
  running.context.Module.onAbort("Wasm aborted");
  assert.deepEqual(running.reports, []);
});
