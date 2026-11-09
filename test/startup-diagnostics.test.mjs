import assert from "node:assert/strict";
import test from "node:test";
import { collectStartupDiagnostics, observeStartupDiagnostics } from "../app/game-player/startup-diagnostics.mjs";

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
