import process from "node:process";

function printHelp() {
  console.log(`Usage: pnpm run sentry:issues -- [options]

Options:
  --days <n>        Relative window in days. Default: 14
  --limit <n>       Maximum issues to return. Default: 10
  --query <text>    Sentry issue query string
  --help            Show this help message
`);
}

function parseArgs(argv) {
  const options = {
    days: 14,
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
      throw new Error("Private env-file overrides are not supported; use the reviewed Vault reader.");
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

function validateEnv(env) {
  const token = env.SENTRY_AUTH_TOKEN || "";

  if (env.SENTRY_VAULT_TRANSPORT !== "agent-vault" || token !== "sentry_read_public_placeholder") {
    throw new Error("SENTRY_AUTH_TOKEN must be the public placeholder from the reviewed Vault launcher.");
  }
  if (env.SENTRY_ORG !== "tsilva" || env.SENTRY_PROJECT !== "scummweb" || !env.SENTRY_BASE_URL) {
    throw new Error("Expected the reviewed ScummWEB Sentry binding.");
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
    throw new Error(`Sentry API request failed (${response.status}); provider details suppressed.`);
  }

  return response.json();
}

async function main() {
  const options = parseArgs(process.argv.slice(2));

  if (options.help) {
    printHelp();
    return;
  }

  const env = {
    SENTRY_ORG: "tsilva",
    SENTRY_PROJECT: "scummweb",
    SENTRY_BASE_URL: "https://sentry.io",
    ...process.env,
    SENTRY_AUTH_TOKEN: process.env.SENTRY_AUTH_TOKEN ?? "",
  };
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
