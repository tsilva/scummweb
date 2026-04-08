import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const ROOT_DIR = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const DEFAULT_ENV_CANDIDATES = [
  path.join(ROOT_DIR, ".env"),
  path.join(ROOT_DIR, ".env.sentry-mcp"),
];
const PLACEHOLDER_TOKENS = new Set(["sntrys_your_token_here", "sntrys_", "sntryu_"]);

function resolveDefaultEnvPath() {
  for (const candidate of DEFAULT_ENV_CANDIDATES) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  return DEFAULT_ENV_CANDIDATES[0];
}

function printHelp() {
  console.log(`Usage: pnpm run sentry:issues -- [options]

Options:
  --days <n>        Relative window in days. Default: 14
  --limit <n>       Maximum issues to return. Default: 10
  --query <text>    Sentry issue query string
  --env-file <path> Alternate env file path. Default: .env (falls back to .env.sentry-mcp)
  --help            Show this help message
`);
}

function parseArgs(argv) {
  const options = {
    days: 14,
    envFile: resolveDefaultEnvPath(),
    help: false,
    limit: 10,
    query: "",
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--") {
      continue;
    }

    if (arg === "--help") {
      options.help = true;
      continue;
    }

    if (arg === "--days") {
      options.days = Number.parseInt(argv[index + 1], 10);
      index += 1;
      continue;
    }

    if (arg === "--limit") {
      options.limit = Number.parseInt(argv[index + 1], 10);
      index += 1;
      continue;
    }

    if (arg === "--query") {
      options.query = argv[index + 1] || "";
      index += 1;
      continue;
    }

    if (arg === "--env-file") {
      options.envFile = path.resolve(process.cwd(), argv[index + 1] || "");
      index += 1;
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  if (!Number.isInteger(options.days) || options.days <= 0) {
    throw new Error(`--days must be a positive integer, got ${options.days}`);
  }

  if (!Number.isInteger(options.limit) || options.limit <= 0) {
    throw new Error(`--limit must be a positive integer, got ${options.limit}`);
  }

  return options;
}

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Missing env file: ${filePath}`);
  }

  const raw = fs.readFileSync(filePath, "utf8");
  const result = {};

  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const separatorIndex = trimmed.indexOf("=");

    if (separatorIndex === -1) {
      continue;
    }

    const key = trimmed.slice(0, separatorIndex).trim();
    let value = trimmed.slice(separatorIndex + 1).trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    result[key] = value;
  }

  return result;
}

function validateEnv(env) {
  const token = env.SENTRY_AUTH_TOKEN || "";

  if (!token) {
    throw new Error("SENTRY_AUTH_TOKEN is required in the Sentry env file.");
  }

  if (PLACEHOLDER_TOKENS.has(token)) {
    throw new Error("SENTRY_AUTH_TOKEN still has the placeholder value.");
  }

  for (const key of ["SENTRY_ORG", "SENTRY_PROJECT", "SENTRY_BASE_URL"]) {
    if (!env[key]) {
      throw new Error(`${key} is required in the Sentry env file.`);
    }
  }
}

function formatCount(value) {
  return value === 1 ? "1 event" : `${value} events`;
}

function normalizeHumanBaseUrl(baseUrl) {
  return baseUrl.replace(/\/api\/0\/?$/, "").replace(/\/+$/, "");
}

function normalizeApiBaseUrl(baseUrl) {
  const humanBaseUrl = normalizeHumanBaseUrl(baseUrl);
  return `${humanBaseUrl}/api/0`;
}

function buildIssueQuery(days, rawQuery) {
  const trimmedQuery = rawQuery.trim();
  const hasExplicitWindow = /\bfirst(?:_|)seen:/i.test(trimmedQuery);
  const windowQuery = `firstSeen:-${days}d`;

  if (!trimmedQuery) {
    return windowQuery;
  }

  if (hasExplicitWindow) {
    return trimmedQuery;
  }

  return `${windowQuery} ${trimmedQuery}`;
}

async function fetchSentryJson(url, token) {
  const response = await fetch(url, {
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Sentry API request failed (${response.status}): ${body}`);
  }

  return response.json();
}

async function main() {
  const options = parseArgs(process.argv.slice(2));

  if (options.help) {
    printHelp();
    return;
  }

  const env = loadEnvFile(options.envFile);
  validateEnv(env);

  const humanBaseUrl = normalizeHumanBaseUrl(env.SENTRY_BASE_URL);
  const apiBaseUrl = normalizeApiBaseUrl(env.SENTRY_BASE_URL);
  const project = await fetchSentryJson(
    `${apiBaseUrl}/projects/${encodeURIComponent(env.SENTRY_ORG)}/${encodeURIComponent(
      env.SENTRY_PROJECT
    )}/`,
    env.SENTRY_AUTH_TOKEN
  );
  const issueQuery = buildIssueQuery(options.days, options.query);
  const params = new URLSearchParams({
    limit: String(options.limit),
    project: String(project.id),
    query: issueQuery,
  });
  const issues = await fetchSentryJson(
    `${apiBaseUrl}/organizations/${encodeURIComponent(env.SENTRY_ORG)}/issues/?${params.toString()}`,
    env.SENTRY_AUTH_TOKEN
  );

  if (!Array.isArray(issues) || issues.length === 0) {
    console.log(
      `No issues found for ${env.SENTRY_ORG}/${env.SENTRY_PROJECT} in the last ${options.days}d${
        options.query ? ` matching "${options.query}"` : ""
      }.`
    );
    return;
  }

  console.log(
    `Recent issues for ${env.SENTRY_ORG}/${env.SENTRY_PROJECT} in the last ${options.days}d${
      options.query ? ` matching "${options.query}"` : ""
    }:`
  );

  for (const issue of issues) {
    const count = Number.parseInt(issue.count || "0", 10);
    const normalizedCount = Number.isFinite(count) ? count : 0;
    const level = issue.level || "unknown";
    const title = issue.title || issue.shortId || "Untitled issue";
    const permalink =
      issue.permalink || `${humanBaseUrl}/organizations/${env.SENTRY_ORG}/issues/${issue.id}/`;

    console.log(`- [${level}] ${title} (${formatCount(normalizedCount)})`);
    console.log(`  ${permalink}`);
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
