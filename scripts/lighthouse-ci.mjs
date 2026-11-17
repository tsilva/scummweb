import fs from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import desktop from "lighthouse/core/config/desktop-config.js";
import { computeMedianRun } from "lighthouse/core/lib/median-run.js";

// Preserve the existing CI exclusions. Cloudflare and application scripts run.
export const config = { ...desktop, settings: { ...desktop.settings, blockedUrlPatterns: [
  "https://www.googletagmanager.com/gtag/js*",
  "https://www.googletagmanager.com/gtm.js*",
  "https://*.google-analytics.com/*",
  "https://analytics.google.com/g/collect*",
  "https://stats.g.doubleclick.net/g/collect*",
] } };

export function auditUrl(value) {
  const url = new URL(value);
  if (url.protocol !== "https:" || !url.hostname || url.username || url.password || url.search || url.hash || /\s/.test(value)) {
    throw new Error("Use a public HTTPS URL without credentials, query or fragment.");
  }
  return url.href;
}

export function summarize(reports, expectedDeployment = "") {
  if (reports.length !== 3) throw new Error("Exactly three Lighthouse runs are required.");
  const deployments = reports.map(report => {
    if (report.runtimeError || report.configSettings.formFactor !== "desktop" ||
        !Number.isFinite(report.categories.performance.score)) throw new Error("Invalid desktop audit.");
    const ids = new Set(report.audits["network-requests"].details.items.flatMap(request => {
      const url = new URL(request.url);
      return url.origin === new URL(report.requestedUrl).origin && url.pathname.startsWith("/_next/static/") && url.searchParams.has("dpl")
        ? [url.searchParams.get("dpl")] : [];
    }));
    if (ids.size !== 1) throw new Error("Missing or mixed app deployment identifiers.");
    return [...ids][0];
  });
  if (new Set(deployments).size !== 1 || expectedDeployment && deployments[0] !== expectedDeployment) {
    throw new Error("Production changed or does not match the completed deployment.");
  }
  const median = computeMedianRun(reports);
  return { lighthouseVersion: median.lighthouseVersion, deployment: deployments[0],
    samples: reports.map((report, index) => ({ run: index + 1, representative: report === median,
      scores: Object.fromEntries(Object.entries(report.categories).map(([key, category]) => [key, category.score])),
      metrics: report.audits.metrics?.details?.items?.[0] ?? {} })) };
}

// Browser protocol logs can include clearance/session cookies. Scrub before any
// artifact is written, including duplicate token values embedded in trace data.
export function redactAuditData(input, secrets = new Set()) {
  const sensitive = /^(?:cookie|set-cookie|authorization|proxy-authorization)$/i;
  function remember(value, name) {
    if (typeof value !== "string") {
      if (value && typeof value.value === "string") remember(value.value, name);
      return;
    }
    if (value.length >= 8) secrets.add(value);
    const pairs = /^set-cookie$/i.test(name) ? value.split("\n").map(line => line.split(";", 1)[0]) : value.split(";");
    const parts = /cookie/i.test(name) ? pairs.map(part => part.slice(part.indexOf("=") + 1).trim())
      : [value.replace(/^\S+\s+/, "")];
    for (const token of parts) if (token.length >= 8) secrets.add(token);
  }
  function visit(value, key = "") {
    if (sensitive.test(key)) remember(value, key);
    if (!value || typeof value !== "object") return;
    if (sensitive.test(value.name)) remember(value.value, value.name);
    for (const [name, item] of Object.entries(value)) {
      if (/headerstext$/i.test(name) && typeof item === "string") {
        for (const line of item.split(/\r?\n/)) {
          const split = line.indexOf(":");
          if (split > 0 && sensitive.test(line.slice(0, split))) remember(line.slice(split + 1).trim(), line.slice(0, split));
        }
      }
      visit(item, name);
    }
  }
  visit(input);
  return JSON.parse(JSON.stringify(input, (key, value) => {
    if (sensitive.test(key)) return "[redacted]";
    if (value && typeof value === "object" && sensitive.test(value.name)) return { ...value, value: "[redacted]" };
    if (typeof value !== "string") return value;
    if (/headerstext$/i.test(key)) value = value.replace(/^(?:cookie|set-cookie|authorization|proxy-authorization):[^\r\n]*/gmi, "[redacted]");
    for (const secret of secrets) value = value.replaceAll(secret, "[redacted]");
    return value;
  }));
}

export async function runAudit() {
  const require = createRequire(import.meta.url);
  const packageJson = JSON.parse(await fs.readFile(new URL("../package.json", import.meta.url), "utf8"));
  const installed = require("lighthouse/package.json").version;
  if (installed !== packageJson.devDependencies.lighthouse) throw new Error("Lighthouse must match the exact repository pin.");
  const url = auditUrl(process.env.LIGHTHOUSE_URL || "https://scummweb.tsilva.eu/");
  const directory = path.resolve(".internal/evidence/lighthouse-ci");
  await fs.mkdir(directory, { recursive: true });
  const configPath = path.join(directory, "config.json");
  await fs.writeFile(configPath, JSON.stringify(config));
  const lighthouse = (await import("lighthouse")).default;
  const lighthouseRequire = createRequire(require.resolve("lighthouse"));
  const { launch } = await import(pathToFileURL(lighthouseRequire.resolve("chrome-launcher")).href);
  const { saveAssets } = await import("lighthouse/core/lib/asset-saver.js");
  const { ReportGenerator } = await import("lighthouse/report/generator/report-generator.js");
  const reports = [];
  for (let run = 1; run <= 3; run++) {
    const prefix = path.join(directory, `sample-${run}`);
    const chrome = await launch({ chromeFlags: ["--headless", "--no-sandbox", "--disable-dev-shm-usage"] });
    try {
      const result = await lighthouse(url, { port: chrome.port, logLevel: "error", channel: "cli" }, config);
      if (!result) throw new Error(`Lighthouse run ${run} returned no result.`);
      const safe = redactAuditData({ lhr: result.lhr, artifacts: {
        Trace: result.artifacts.Trace, DevtoolsLog: result.artifacts.DevtoolsLog,
        TraceError: result.artifacts.TraceError, DevtoolsLogError: result.artifacts.DevtoolsLogError,
      } });
      await fs.writeFile(`${prefix}.report.json`, JSON.stringify(safe.lhr, null, 2) + "\n");
      await fs.writeFile(`${prefix}.report.html`, ReportGenerator.generateReportHtml(safe.lhr));
      await saveAssets(safe.artifacts, safe.lhr.audits, prefix);
      reports.push(safe.lhr);
    } finally {
      await chrome.kill();
    }
  }
  const result = summarize(reports, process.env.LIGHTHOUSE_EXPECTED_DEPLOYMENT || "");
  await fs.writeFile(path.join(directory, "summary.json"), JSON.stringify(result, null, 2) + "\n");
  const lines = [`Lighthouse ${result.lighthouseVersion}; deployment ${result.deployment}.`, "",
    "| Run | Performance | Accessibility | Best practices | SEO | Representative |",
    "| --- | --- | --- | --- | --- | --- |",
    ...result.samples.map(sample => `| ${sample.run} | ${["performance", "accessibility", "best-practices", "seo"].map(key => Math.round(sample.scores[key] * 100)).join(" | ")} | ${sample.representative ? "Yes" : ""} |`),
    "", "All reports and redacted traces are in the Lighthouse artifact.", ""];
  if (process.env.GITHUB_STEP_SUMMARY) await fs.appendFile(process.env.GITHUB_STEP_SUMMARY, lines.join("\n"));
  console.log(JSON.stringify(result));
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) await runAudit();
