import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

const [startDate, endDate, ...extra] = process.argv.slice(2);
const validDate = (value) => /^\d{4}-\d{2}-\d{2}$/.test(value || "") &&
  !Number.isNaN(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
if (!validDate(startDate) || !validDate(endDate) || startDate > endDate || extra.length) {
  console.error("Usage: pnpm analytics:check:vault YYYY-MM-DD YYYY-MM-DD");
  process.exit(1);
}

const root = path.join(homedir(), ".config", "infisical", "ga4-reporting");
try {
  const inventory = JSON.parse(await readFile(path.join(root, "properties.json"), "utf8"));
  const matches = Object.entries(inventory).filter(([, name]) => name === "scummweb");
  if (matches.length !== 1 || !/^\d{9}$/.test(matches[0][0])) {
    throw new Error("ScummWEB must resolve to exactly one approved property.");
  }
  const dimensions = ["game_slug", "entry_point", "launch_mode", "failure_reason",
    "play_time_seconds", "traffic_type", "automation_reason"].map((name) => `customEvent:${name}`);
  const metrics = ["eventCount", "customEvent:load_time_ms", "averageCustomEvent:load_time_ms"];
  const request = {
    dateRanges: [{ startDate, endDate }],
    dimensions: dimensions.map((name) => ({ name })),
    metrics: metrics.map((name) => ({ name })),
    dimensionFilter: { filter: { fieldName: "hostName", stringFilter: {
      matchType: "EXACT", value: "scummweb.tsilva.eu", caseSensitive: true,
    } } },
    limit: 1,
  };
  // Only this installed sandboxed route is supported. Do not retrieve tokens,
  // invoke the Admin API, change permissions, or fall back to direct requests.
  const result = spawnSync(path.join(root, "report"), ["--request-json", matches[0][0]], {
    input: JSON.stringify(request), encoding: "utf8", timeout: 60_000,
    maxBuffer: 4 * 1024 * 1024,
  });
  if (result.error || result.status !== 0) {
    throw new Error("Approved GA4 report failed. Check broker access and custom-definition registration/propagation; no fallback used.");
  }
  const report = JSON.parse(result.stdout);
  if (JSON.stringify(report.dimensionHeaders?.map(({ name }) => name)) !== JSON.stringify(dimensions) ||
      JSON.stringify(report.metricHeaders?.map(({ name }) => name)) !== JSON.stringify(metrics)) {
    throw new Error("GA4 returned unexpected report headers.");
  }
  console.log(JSON.stringify({ status: "reportable", dimensions, metrics, startDate, endDate,
    note: "Schema acceptance only; empty or (not set) values do not prove collection. No report rows are printed." }, null, 2));
} catch (error) {
  // Provider output stays withheld, including failures from the installed route.
  console.error(error.code === "ENOENT" ? "Approved GA4 reporting installation is unavailable." :
    error instanceof SyntaxError ? "Unexpected GA4 inventory or report JSON." :
    error.message.startsWith("ScummWEB ") || error.message.startsWith("Approved GA4 ") ||
    error.message.startsWith("GA4 returned ") ? error.message : "GA4 reporting check failed; provider output withheld.");
  process.exitCode = 1;
}
