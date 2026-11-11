import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import net from "node:net";
import { installSession, MARKER } from "../sentry_session.mjs";

try {
  const base = process.env.FIXTURE_BASE;
  const headers = { Authorization: `Bearer ${MARKER}` };
  const nativeFetch = globalThis.fetch;
  for (const [path, method] of [
    ["/api/0/projects/tsilva/unrelated/", "GET"],
    ["/api/0/projects/tsilva/scummweb-unrelated/", "GET"],
    ["/api/0/projects/tsilva/scummweb/issues/../../unrelated/", "GET"],
    ["/api/0/projects/tsilva/scummweb/issues/", "POST"],
  ]) {
    const denied = await nativeFetch(base + path, { method, headers, redirect: "error" });
    assert.equal(denied.status, 403);
    await denied.body?.cancel();
  }

  installSession(base);
  const metadata = await fetch(`${base}/api/0/projects/tsilva/scummweb/`, { headers });
  assert.deepEqual(await metadata.json(), { id: "12345", slug: "scummweb", name: "scummweb" });
  await assert.rejects(fetch(`${base}/api/0/projects/tsilva/unrelated/`, { headers }));
  assert.throws(() => readFileSync(process.env.FIXTURE_CANARY));
  const directDenied = await new Promise(resolve => {
    const socket = net.connect(Number(new URL(base).port), "127.0.0.1");
    socket.once("error", () => resolve(true));
    socket.once("connect", () => { socket.destroy(); resolve(false); });
  });
  assert.equal(directDenied, true);

  process.argv = [process.execPath, "list_sentry_issues.mjs", "--days", "3", "--limit", "1"];
  await import("../../list_sentry_issues.mjs");
  console.log(JSON.stringify({
    ok: true, actual_reader: true, project_scope: true,
    native_write_and_other_project_denial: true, metadata_filtered: true,
    private_file_denied: true, direct_network_denied: true,
    credential_mode: "public-placeholder",
  }));
} catch {
  console.log(JSON.stringify({ ok: false, reason: "Synthetic Sentry test failed; details withheld" }));
  process.exitCode = 1;
}
