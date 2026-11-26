import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import test from "node:test";

const root = new URL("../../", import.meta.url);
const zipEntry = new URL(import.meta.resolve("@zip.js/zip.js"));
const fixture = new URL("./fixtures/dropbox-storage-pressure.mjs", import.meta.url);
const config = "[scummvm]\n";
const enabled = process.env.SCUMMWEB_RUN_BROWSER_INTEGRATION === "1";

const fixtureScript = `<script type="module">
try {
  await import('/fixture.mjs');
} catch (error) {
  document.querySelector('#result').textContent = String(error);
  await fetch('/result' + location.pathname, { method: 'POST', body: JSON.stringify({ ok: false, error: String(error) }) });
}
</script>`;

const html = (script) => `<!doctype html><meta charset="utf-8"><title>ScummWEB storage pressure integration</title>
<script type="importmap">{"imports":{"@zip.js/zip.js":"/zip/${zipEntry.pathname.split("/").at(-1)}"}}</script>
<p id="result" role="status">Running storage pressure integration…</p>${script}`;

const cloudFrame = html(`<script type="module">
const type = "scummweb:cloud";
addEventListener("message", async ({ origin, source, data }) => {
  if (origin !== location.origin || source !== parent || data?.type !== type) return;
  try {
    const result = await parent.answerFixtureCloudRequest(data);
    parent.postMessage({ type, id: data.id, ok: true, ...result }, origin);
  } catch {
    parent.postMessage({ type, id: data.id, ok: false, kind: "request" }, origin);
  }
});
parent.postMessage({ type, op: "booted" }, location.origin);
</script>`);

function send(response, type, body) {
  response.writeHead(200, { "Content-Type": type, "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff" });
  response.end(body);
}

test("low reported storage in Brave evicts only verified idle saves and restores on launch", {
  skip: enabled ? false : "Set SCUMMWEB_RUN_BROWSER_INTEGRATION=1 and open the printed URL in Brave",
  timeout: 120_000,
}, async () => {
  const nonce = randomUUID();
  const result = Promise.withResolvers();
  let origin;
  const server = createServer(async (request, response) => {
    const path = new URL(request.url, origin).pathname;
    try {
      if (request.headers.host !== new URL(origin).host) {
        response.writeHead(403).end();
      } else if (request.method === "POST" && path === `/result/${nonce}` && request.headers.origin === origin) {
        request.setEncoding("utf8");
        let body = "";
        for await (const chunk of request) {
          body += chunk;
          if (body.length > 8192) throw new Error("Unexpected browser result size.");
        }
        send(response, "text/plain; charset=utf-8", "received");
        result.resolve(JSON.parse(body));
      } else if (request.method !== "GET") {
        response.writeHead(405).end();
      } else if (path === `/${nonce}`) {
        send(response, "text/html; charset=utf-8", html(fixtureScript));
      } else if (path === "/cloud.html") {
        send(response, "text/html; charset=utf-8", cloudFrame);
      } else if (path === "/games.json") {
        send(response, "application/json", JSON.stringify({ games: ["sky", "queen", "lure"].map(target =>
          ({ target, displayTitle: target, engineId: target, gameId: target })) }));
      } else if (path === "/data/game-downloads.json") {
        send(response, "application/json", await readFile(new URL(path.slice(1), root)));
      } else if (path === "/scummvm.ini") {
        send(response, "text/plain; charset=utf-8", config);
      } else if (path === "/fixture.mjs") {
        send(response, "text/javascript; charset=utf-8", await readFile(fixture));
      } else if (/^\/(?:app|lib|web-shell)\/(?:[a-zA-Z0-9_-]+\/)*[a-zA-Z0-9_.-]+\.mjs$/.test(path)) {
        send(response, "text/javascript; charset=utf-8", await readFile(new URL(path.slice(1), root)));
      } else if (/^\/zip\/(?:[a-zA-Z0-9_-]+\/)*[a-zA-Z0-9_.-]+\.(?:js|wasm)$/.test(path)) {
        const contentType = path.endsWith(".wasm") ? "application/wasm" : "text/javascript; charset=utf-8";
        send(response, contentType, await readFile(new URL(path.slice("/zip/".length), zipEntry)));
      } else {
        response.writeHead(404).end();
      }
    } catch (error) {
      if (!response.headersSent) response.writeHead(error.code === "ENOENT" ? 404 : 500);
      response.end();
      if (path.startsWith("/result/")) result.reject(error);
    }
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  origin = `http://127.0.0.1:${server.address().port}`;
  console.log(`Open this test URL in Brave: ${origin}/${nonce}`);
  const timer = setTimeout(() => result.reject(new Error("Brave did not report a test result.")), 90_000);
  try {
    const report = await result.promise;
    assert.equal(report.ok, true, report.error);
    assert.deepEqual(report.checks, [
      "working copies verified in the cloud",
      "low estimate evicted only the verified idle edition",
      "pending bytes and running edition retained",
      "background sync left the evicted edition cloud-only",
      "launch restored the exact files without a cloud write",
    ]);
  } finally {
    clearTimeout(timer);
    server.close();
    server.closeAllConnections();
  }
});
