const DEFAULT_TRACES_SAMPLE_RATE = 0.1;

function parseBoolean(value) {
  if (typeof value !== "string") {
    return null;
  }

  if (value === "true") {
    return true;
  }

  if (value === "false") {
    return false;
  }

  return null;
}

function parseNumber(value, fallback) {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function getSentryDsn(target = "server") {
  if (target === "browser") {
    return process.env.NEXT_PUBLIC_SENTRY_DSN || "";
  }

  return process.env.SENTRY_DSN || process.env.NEXT_PUBLIC_SENTRY_DSN || "";
}

export function hasSentryDsn(target = "server") {
  return Boolean(getSentryDsn(target));
}

export function isSentryEnabled(target = "server") {
  const explicitOverride = parseBoolean(process.env.NEXT_PUBLIC_SENTRY_ENABLED);

  if (explicitOverride !== null) {
    return explicitOverride && hasSentryDsn(target);
  }

  return process.env.NEXT_PUBLIC_SENTRY_ENABLED_DEFAULT === "true" && hasSentryDsn(target);
}

export function getSentryEnvironment() {
  return (
    process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT ||
    process.env.SENTRY_ENVIRONMENT ||
    process.env.VERCEL_ENV ||
    process.env.NODE_ENV ||
    "development"
  );
}

export function getTracesSampleRate() {
  return parseNumber(process.env.SENTRY_TRACES_SAMPLE_RATE, DEFAULT_TRACES_SAMPLE_RATE);
}

export function getSentryOptions(target = "server") {
  const dsn = getSentryDsn(target);

  return {
    dsn,
    enabled: Boolean(dsn) && isSentryEnabled(target),
    enableLogs: true,
    environment: getSentryEnvironment(),
    sendDefaultPii: true,
    tracesSampleRate: getTracesSampleRate(),
  };
}
