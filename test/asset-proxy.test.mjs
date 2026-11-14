import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import test from "node:test";
import swc from "next/dist/build/swc/index.js";
import { isInAppBrowser } from "../app/in-app-browser.mjs";

await swc.loadBindings();
const { code } = await swc.transform(await readFile(new URL("../proxy.js", import.meta.url), "utf8"), {
  filename: "proxy.js", swcrc: false, configFile: false,
  module: { type: "commonjs" }, jsc: { parser: { syntax: "ecmascript" } },
});
const module = { exports: {} };
runInNewContext(code, {
  module, exports: module.exports, URL,
  require(name) {
    if (name === "./app/in-app-browser.mjs") return { isInAppBrowser };
    assert.equal(name, "next/server");
    return { NextResponse: {
      next: () => ({ kind: "next", headers: new Headers() }),
      rewrite: (url) => ({ kind: "rewrite", url }),
    } };
  },
});

function request(path, destination) {
  const url = new URL(path, "https://example.test");
  return module.exports.proxy({ nextUrl: url, url: url.href, headers: new Headers(destination ? { "sec-fetch-dest": destination } : {}) });
}

test("standalone runtime documents keep the legacy launcher rewrite", () => {
  for (const [path, destination] of [["/scummvm.html?v=sha-shell", undefined],
    ["/scummvm.html?localGame=1&v=sha-shell", "document"],
    ["/scummvm.html?saveQuery=query-id&saveTarget=sky", "document"]]) {
    const response = request(path, destination);
    assert.equal(response.kind, "rewrite");
    assert.equal(response.url.pathname, "/legacy-play");
    assert.equal(response.url.search, new URL(path, "https://example.test").search);
  }
});

test("native save-query frames reach the shell without starting a local archive handoff", () => {
  for (const destination of ["iframe", "empty", undefined]) {
    const response = request("/scummvm.html?saveQuery=query-id&saveEngine=sky&saveGameId=sky&saveTarget=sky", destination);
    assert.equal(response.kind, "next");
    assert.equal(response.headers.get("Cache-Control"), null);
  }
});

test("game iframes and inline fallback fetches reach the shell without immutable HTML overrides", () => {
  for (const destination of ["iframe", "empty", undefined]) {
    const response = request("/scummvm.html?localGame=1&catalogGame=dreamweb&v=sha-shell", destination);
    assert.equal(response.kind, "next");
    assert.equal(response.headers.get("Cache-Control"), null);
  }
});

