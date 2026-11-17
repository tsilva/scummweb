import fs from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";
import { spawnSync } from "node:child_process";
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
  const reports = [];
  for (let run = 1; run <= 3; run++) {
    const prefix = path.join(directory, `sample-${run}`);
    const child = spawnSync(process.execPath, [require.resolve("lighthouse/cli/index.js"), url,
      `--config-path=${configPath}`, "--output=json", "--output=html", `--output-path=${prefix}`,
      "--save-assets", "--quiet", "--chrome-flags=--headless --no-sandbox --disable-dev-shm-usage"], { stdio: "inherit" });
    if (child.error || child.status !== 0) throw child.error || new Error(`Lighthouse run ${run} failed.`);
    reports.push(JSON.parse(await fs.readFile(`${prefix}.report.json`, "utf8")));
  }
  const result = summarize(reports, process.env.LIGHTHOUSE_EXPECTED_DEPLOYMENT || "");
  await fs.writeFile(path.join(directory, "summary.json"), JSON.stringify(result, null, 2) + "\n");
  const lines = [`Lighthouse ${result.lighthouseVersion}; deployment ${result.deployment}.`, "",
    "| Run | Performance | Accessibility | Best practices | SEO | Representative |",
    "| --- | --- | --- | --- | --- | --- |",
    ...result.samples.map(sample => `| ${sample.run} | ${["performance", "accessibility", "best-practices", "seo"].map(key => Math.round(sample.scores[key] * 100)).join(" | ")} | ${sample.representative ? "Yes" : ""} |`),
    "", "All reports and raw traces are in the Lighthouse artifact.", ""];
  if (process.env.GITHUB_STEP_SUMMARY) await fs.appendFile(process.env.GITHUB_STEP_SUMMARY, lines.join("\n"));
  console.log(JSON.stringify(result));
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) await runAudit();
