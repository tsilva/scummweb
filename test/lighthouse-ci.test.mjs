import assert from "node:assert/strict";
import test from "node:test";
import { auditUrl, config, summarize } from "../scripts/lighthouse-ci.mjs";

function report(fcp, interactive, score, deployment = "gha-123-1") {
  return { requestedUrl: "https://scummweb.tsilva.eu/", lighthouseVersion: "13.6.0", configSettings: { formFactor: "desktop" },
    categories: { performance: { score } }, audits: {
      "first-contentful-paint": { numericValue: fcp }, interactive: { numericValue: interactive },
      "network-requests": { details: { items: [{ url: `https://scummweb.tsilva.eu/_next/static/chunks/app.js?dpl=${deployment}` }] } },
    } };
}
test("representative run uses Lighthouse's median timing rule, not the highest score", () => {
  const summary = summarize([report(100, 200, 1), report(300, 400, .98), report(500, 600, .99)]);
  assert.deepEqual(summary.samples.map(row => row.representative), [false, true, false]);
  assert.deepEqual(summary.samples.map(row => row.scores.performance), [1, .98, .99]);
});
test("all samples must measure one expected Production deployment", () => {
  const rows = [report(100, 200, 1), report(200, 300, 1), report(300, 400, 1)];
  assert.equal(summarize(rows, "gha-123-1").deployment, "gha-123-1");
  assert.throws(() => summarize(rows, "gha-124-1"), /does not match/);
  assert.throws(() => summarize([...rows.slice(0, 2), report(300, 400, 1, "gha-124-1")]), /Production changed/);
  assert.throws(() => summarize(rows.slice(0, 2)), /three/);
  const missing = structuredClone(rows); missing[0].audits["network-requests"].details.items = [];
  assert.throws(() => summarize(missing), /Missing/);
});
test("desktop settings and existing analytics exclusions keep bot scripts measurable", () => {
  assert.equal(config.settings.formFactor, "desktop");
  assert.equal(config.settings.throttling.cpuSlowdownMultiplier, 1);
  assert.equal(config.settings.blockedUrlPatterns.length, 5);
  assert.equal(config.settings.blockedUrlPatterns.some(value => /cloudflare|cdn-cgi|_next/.test(value)), false);
  assert.equal(auditUrl("https://scummweb.tsilva.eu/"), "https://scummweb.tsilva.eu/");
  for (const value of ["http://example.com", "https://user:pass@example.com", "https://example.com/?token=a", "https://example.com/#a"]) assert.throws(() => auditUrl(value));
});
