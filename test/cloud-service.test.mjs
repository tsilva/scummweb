import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import test from "node:test";
import { createCloudTransferFetch } from "../web-shell/cloud-transfer-fetch.mjs";

test("the real service keeps its command pending through byte progress and replies with the original transfer ID", async () => {
  const messages = [], bytes = new Uint8Array(100), origin = "https://example.test";
  let receive;
  const parent = { postMessage: message => messages.push(message) };
  const sandbox = { createCloudTransferFetch, URL, Headers, Response, TransformStream, Uint8Array,
    location: { origin, href: origin + "/cloud.html" }, parent,
    window: { addEventListener: (_, listener) => { receive = listener; } },
    document: { createElement: () => ({}), getElementById: () => ({}), head: { append() {} } },
    FS: { writeFile() {}, unlink() {}, readFile: path => path.endsWith("config.ini") ? "synthetic-config" : bytes },
    fetch: async url => url === "runtime-assets.json" ? Response.json({ files: {} }) : new Response(bytes, { headers: { "Content-Length": "100" } }),
  };
  const source = (await readFile(new URL("../web-shell/cloud-service.mjs", import.meta.url), "utf8")).replace(/^import .*;\n/m, "");
  runInNewContext(source, sandbox);
  const command = data => receive({ origin, source: parent, data: { type: "scummweb:cloud", ...data } });
  await command({ op: "init", id: 0, config: "synthetic-config" });
  const name = "a".repeat(64) + ".zip";
  await command({ op: "upload", id: 1, name, bytes });
  await sandbox.fetch("https://content.dropboxapi.com/2/files/upload", { body: bytes, headers: {} });
  assert.equal(messages.at(-1).op, "progress"); assert.equal(messages.at(-1).id, 1);
  await command({ op: "download", id: 2, name, size: 100 });
  assert.equal(sandbox.__scummwebCloudCommand.op, "upload", "progress cannot release the pending command");
  sandbox.__scummwebCloudReply({ ok: true });
  assert.equal(messages.at(-1).id, 1); assert.equal(messages.at(-1).ok, true);
  await command({ op: "download", id: 2, name, size: 100 });
  const response = await sandbox.fetch("https://content.dropboxapi.com/2/files/download");
  assert.equal((await response.arrayBuffer()).byteLength, 100);
  assert.equal(messages.at(-1).op, "progress"); assert.equal(messages.at(-1).id, 2);
  sandbox.__scummwebCloudReply({ ok: true });
  assert.equal(messages.at(-1).id, 2);
  assert.deepEqual(messages.at(-1).bytes, bytes);
});
