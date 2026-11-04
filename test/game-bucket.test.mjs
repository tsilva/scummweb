import assert from "node:assert/strict";
import test from "node:test";
import { BlobWriter, Uint8ArrayReader, ZipWriter } from "@zip.js/zip.js";
import { normalizeBucketUrl, normalizeGameZipUrl, readCatalogGameArchive, readRemoteGameArchive, readSavedBucket } from "../app/game-bucket.mjs";
import { maxArchiveSize } from "../app/local-game-archive.mjs";

const customUrl = "https://games.example.com";
const games = [
  { target: "sky", path: "/games/sky" },
  { target: "dreamweb-cd", path: "/games/dreamweb" },
  { target: "queen", path: "/games/queen" },
];

test("direct ZIP links require HTTPS and a ZIP path and keep query parameters", () => {
  const zipUrl = `${customUrl}/folder/Game%20Demo.ZIP?key=a%2Bb`;
  assert.equal(normalizeGameZipUrl(` ${zipUrl}#ignored `), zipUrl);
  for (const invalid of [
    customUrl,
    "http://games.example.com/game.zip",
    "https://user:password@games.example.com/game.zip",
    `${customUrl}/game%xx.zip`,
    `${customUrl}/download?name=game.zip`,
  ]) {
    assert.throws(() => normalizeGameZipUrl(invalid), /direct HTTPS link/);
  }
});

test("the catalog ZIP loader shares extraction and uses the games proxy on loopback only", async (t) => {
  const zip = new ZipWriter(new BlobWriter());
  await zip.add("sky.dnr", new Uint8ArrayReader(Uint8Array.of(1, 2, 3)));
  const archive = await zip.close();
  const url = `${customUrl}/sky.zip`;
  const location = { hostname: "localhost" };
  const oldWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  Object.defineProperty(globalThis, "window", { configurable: true, value: { location } });
  t.after(() => oldWindow ? Object.defineProperty(globalThis, "window", oldWindow) : delete globalThis.window);
  const fetch = t.mock.method(globalThis, "fetch", async () => new Response(archive));

  assert.deepEqual(await readCatalogGameArchive(url), [
    { path: "sky.dnr", data: Uint8Array.of(1, 2, 3) },
  ]);
  assert.equal(fetch.mock.calls[0].arguments[0], "/games-proxy/sky.zip");

  location.hostname = "scummweb.tsilva.eu";
  await assert.rejects(readCatalogGameArchive(url, { expandedLimit: 2 }), /when unpacked/);
  assert.equal(fetch.mock.calls[1].arguments[0], url);
});

test("saved targets are limited to the current catalog and bucket URLs exclude credentials", () => {
  const saved = JSON.stringify({ url: `${customUrl}/`, targets: ["sky", "unknown", "sky"] });
  assert.deepEqual(readSavedBucket(saved, games), { url: customUrl, targets: ["sky"] });
  assert.throws(() => normalizeBucketUrl("https://user:password@games.example.com"));
  assert.throws(() => normalizeBucketUrl(`${customUrl}?token=abc`));
});

test("the remote ZIP loader fetches the exact URL without credentials or a referrer and enforces its limit", async (t) => {
  const zip = new ZipWriter(new BlobWriter());
  await zip.add("sky/sky.dnr", new Uint8ArrayReader(Uint8Array.of(1, 2, 3)));
  const archive = await zip.close();
  const zipUrl = `${customUrl}/folder/sky.zip?key=a%2Bb`;
  const request = t.mock.method(globalThis, "fetch", async (url, options) => {
    assert.equal(options.mode, "cors");
    assert.equal(options.credentials, "omit");
    assert.equal(options.redirect, "error");
    assert.equal(options.referrerPolicy, "no-referrer");
    assert.equal(options.method ?? "GET", "GET");
    if (url === zipUrl) return new Response(archive);
    assert.equal(url, `${customUrl}/queen.zip`);
    return new Response(new Uint8Array(1), {
      headers: { "content-length": String(maxArchiveSize + 1) },
    });
  });

  assert.deepEqual(await readRemoteGameArchive(zipUrl), [
    { path: "sky.dnr", data: Uint8Array.of(1, 2, 3) },
  ]);
  await assert.rejects(readRemoteGameArchive(`${customUrl}/queen.zip`), /128 MiB/);
  await assert.rejects(readRemoteGameArchive(customUrl), /direct HTTPS link/);
  assert.equal(request.mock.callCount(), 2);
});

test("full downloads reject HTTP errors and web pages before reading their bodies", async (t) => {
  for (const [options, message] of [
    [{ status: 404 }, /HTTP 404/],
    [{ headers: { "content-type": "text/html" } }, /instead of a game ZIP/],
    [{ headers: { "content-type": "application/json" } }, /instead of a game ZIP/],
  ]) {
    let canceled = false;
    const fetch = t.mock.method(globalThis, "fetch", async () => new Response(new ReadableStream({
      cancel() { canceled = true; },
    }), options));
    await assert.rejects(readRemoteGameArchive(`${customUrl}/game.zip`), message);
    assert.equal(canceled, true);
    assert.equal(fetch.mock.callCount(), 1);
    fetch.mock.restore();
  }
});
