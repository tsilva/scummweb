import { installSession, MARKER } from "./sentry_session.mjs";

let httpStatus = null;
try {
  const path = installSession("https://sentry.io");
  const mode = process.argv[2];
  process.argv.splice(2, 1);
  if (mode === "check") {
    const response = await fetch(`https://sentry.io${path}`, {
      headers: { Authorization: `Bearer ${MARKER}` },
    });
    httpStatus = response.status;
    await response.body?.cancel();
    if (!response.ok) throw new Error();
    console.log(JSON.stringify({
      ok: true, read_only: true, project: "scummweb", credential_mode: "public-placeholder",
    }));
  } else if (mode === "issues") {
    await import("../list_sentry_issues.mjs");
  } else {
    throw new Error();
  }
} catch {
  console.log(JSON.stringify({
    ok: false, http_status: httpStatus,
    reason: "ScummWEB Sentry read failed; check the reviewed source and permissions",
  }));
  process.exitCode = 1;
}
