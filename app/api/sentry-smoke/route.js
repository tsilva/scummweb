import * as Sentry from "@sentry/nextjs";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

function getConfiguredToken() {
  return process.env.SENTRY_SMOKE_TEST_TOKEN || "";
}

function getProvidedToken(request) {
  return request.headers.get("x-sentry-smoke-token") || "";
}

export async function POST(request) {
  const configuredToken = getConfiguredToken();
  const providedToken = getProvidedToken(request);

  if (!configuredToken || providedToken !== configuredToken) {
    return NextResponse.json({ ok: false }, { status: 404 });
  }

  const smokeId = crypto.randomUUID();
  const error = new Error(`Intentional Sentry smoke test (${smokeId})`);

  const eventId = Sentry.withScope((scope) => {
    scope.setLevel("warning");
    scope.setTag("smoke_test", "true");
    scope.setTag("smoke_id", smokeId);
    scope.setContext("smoke_test", {
      route: "/api/sentry-smoke",
      smokeId,
    });

    return Sentry.captureException(error);
  });

  await Sentry.flush(2000);

  return NextResponse.json({
    eventId,
    ok: true,
    smokeId,
  });
}
