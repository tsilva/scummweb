import assert from "node:assert/strict";
import test from "node:test";
import { auditUrl, config, summarize, redactAuditData } from "../scripts/lighthouse-ci.mjs";

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


test("artifact redaction removes protocol credentials and their trace copies without changing metrics", () => {
  const token = "synthetic-clearance-token";
  const source = { metrics: { largestContentfulPaint: 720, totalBlockingTime: 2 },
    headers: { Cookie: `cf_clearance=${token}`, Authorization: "Bearer synthetic-auth-token", Accept: "image/avif" },
    entries: [{ name: "Set-Cookie", value: `cf_clearance=${token}; Path=/; Domain=example.test; Expires=Wed, 18 Nov 2026 00:00:00 GMT; Secure` }],
    responseHeadersText: `HTTP/2 200\r\nSet-Cookie: cf_clearance=${token}\r\nContent-Type: text/html`,
    associatedCookies: [{ cookie: { name: "cf_clearance", value: token } }],
    trace: { timestamp: 123, duplicate: token, auth: "synthetic-auth-token", url: "https://app.example.test/", expires: "Wed, 18 Nov 2026 00:00:00 GMT" } };
  const safe = redactAuditData(source);
  const serialized = JSON.stringify(safe);
  assert.equal(serialized.includes(token), false);
  assert.equal(serialized.includes("synthetic-auth-token"), false);
  assert.deepEqual(safe.metrics, source.metrics);
  assert.equal(safe.trace.timestamp, 123);
  assert.equal(safe.trace.url, source.trace.url);
  assert.equal(safe.trace.expires, source.trace.expires);
  assert.equal(safe.headers.Accept, "image/avif");
  assert.equal(source.headers.Cookie, `cf_clearance=${token}`, "redaction must not mutate measurement inputs");
});
