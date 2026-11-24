import assert from "node:assert/strict";
import test from "node:test";
import { collectStartupDiagnostics, getStartupTimeoutStep, observeStartupDiagnostics } from "../app/game-player/startup-diagnostics.mjs";

test("the startup watchdog distinguishes frame, runtime, handoff and rendering waits", () => {
  const marks = new Set();
  const frame = { performance: { getEntriesByName: (name) => marks.has(name) ? [{}] : [] } };
  const iframe = { contentDocument: { URL: "about:blank" }, contentWindow: frame };
  const pending = { receiver: null, transferred: false };
  assert.equal(getStartupTimeoutStep(iframe, pending), "shell-navigation");
  iframe.contentDocument.URL = "https://example.test/scummvm.html?private=1";
  assert.equal(getStartupTimeoutStep(iframe, pending), "runtime-initialization");
  marks.add("scummweb:wasm-ready");
  assert.equal(getStartupTimeoutStep(iframe, pending), "filesystem-before-handoff");
  pending.receiver = frame;
  assert.equal(getStartupTimeoutStep(iframe, pending), "archive-handoff");
  pending.transferred = true;
  assert.equal(getStartupTimeoutStep(iframe, pending), "filesystem-after-handoff");
  marks.add("scummweb:filesystems-ready");
  assert.equal(getStartupTimeoutStep(iframe, pending), "native-startup");
  frame.__scummwebReadyState = { state: "awaiting-frame" };
  assert.equal(getStartupTimeoutStep(iframe, pending), "first-frame");
  frame.__scummwebReadyState.state = "ready";
  assert.equal(getStartupTimeoutStep(iframe, pending), "ready-message");
});

test("startup diagnostics retain timing evidence without request queries or blob identities", () => {
  const performance = { timeOrigin: 123, getEntriesByType: (type) => type === "mark"
    ? [{ name: "scummweb:game-ready", startTime: 12.3 }, { name: "unrelated", startTime: 1 }]
    : [{ name: "https://example.test/data/file?v=hash&token=private", startTime: 4, duration: 5.7, transferSize: 0, initiatorType: "fetch" },
      { name: "blob:https://example.test/private-id", startTime: 1, duration: 2, initiatorType: "xmlhttprequest" }] };
  const report = collectStartupDiagnostics({ performance }, { performance });
  assert.equal(report.frame.resources[0].path, "/data/file");
  assert.equal(report.frame.resources[1].path, "blob:");
  assert.equal(report.parent.marks.length, 1);
  assert.doesNotMatch(JSON.stringify(report), /private|unrelated/);
  assert.equal(observeStartupDiagnostics({ location: { search: "" } }), undefined);
});
