import assert from "node:assert/strict";
import test from "node:test";
import { BlobWriter, Uint8ArrayReader, ZipWriter } from "@zip.js/zip.js";
import { normalizeBucketUrl, normalizeGameZipUrl, readCatalogGameArchive, readRemoteGameArchive, readSavedBucket } from "../app/game-bucket.mjs";
import { maxArchiveSize } from "../app/local-game-archive.mjs";
import { installGameZipCache } from "./helpers/game-zip-cache.mjs";
import { cacheGameZip, maxCachedGameZips, readCachedGameData } from "../app/game-zip-cache.mjs";

async function materialize(files) {
  return Promise.all(files.map(async ({ path, data, blob }) => ({
    path, data: data ?? new Uint8Array(await blob.arrayBuffer()),
  })));
}

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

test("ZIP downloads report streamed percentages and handle unknown totals", async (t) => {
  const zip = new ZipWriter(new BlobWriter());
  await zip.add("sky.dnr", new Uint8ArrayReader(Uint8Array.of(1, 2, 3)));
  const bytes = new Uint8Array(await (await zip.close()).arrayBuffer());
  const midpoint = Math.floor(bytes.length / 2);
  for (const contentLength of [String(bytes.length), null, "invalid", "0"]) {
    const progress = [];
    const fetch = t.mock.method(globalThis, "fetch", async () => new Response(new ReadableStream({
      start(controller) {
        controller.enqueue(bytes.slice(0, midpoint));
        controller.enqueue(bytes.slice(midpoint));
        controller.close();
      },
    }), { headers: contentLength === null ? {} : { "content-length": contentLength } }));
    const files = await readRemoteGameArchive(`${customUrl}/sky.zip`, {
      onProgress: (percent) => progress.push(percent),
    });
    assert.equal(files[0].path, "sky.dnr");
    assert.deepEqual(progress, contentLength === String(bytes.length)
      ? [0, Math.floor(midpoint / bytes.length * 100), 99, 100]
      : [null, 100]);
    fetch.mock.restore();
  }
});

test("repeat launches reuse a persisted ZIP and preserve URL query identity", async (t) => {
  const { entries } = installGameZipCache(t);
  const writer = new ZipWriter(new BlobWriter());
  await writer.add("sky.dnr", new Uint8ArrayReader(Uint8Array.of(1, 2, 3)));
  const archive = await writer.close();
  const fetch = t.mock.method(globalThis, "fetch", async () => new Response(archive));
  const url = `${customUrl}/sky.zip?v=1`;
  const first = await readRemoteGameArchive(url);
  const progress = [];
  const second = await readRemoteGameArchive(url, { onProgress: (value, details) => progress.push([value, details]) });
  assert.deepEqual(await materialize(second), first);
  await readCachedGameData(url);
  assert.equal(entries.size, 1);
  assert.ok(second[0].blob instanceof Blob, "warm files are slices, not another extraction");
  assert.deepEqual(progress, [[null, { cached: true }], [100, { cached: true }]]);
  assert.equal(fetch.mock.callCount(), 1);
  await readRemoteGameArchive(`${customUrl}/sky.zip?v=2`);
  assert.equal(fetch.mock.callCount(), 2);
  await assert.rejects(readRemoteGameArchive(url, { archiveLimit: 1 }), /download limit/);
  await assert.rejects(readRemoteGameArchive(url, { expandedLimit: 1 }), /when unpacked/);
});

test("the catalog loader reuses cached ZIPs across launches", async (t) => {
  installGameZipCache(t);
  const previous = Object.getOwnPropertyDescriptor(globalThis, "window");
  Object.defineProperty(globalThis, "window", { configurable: true, value: { location: { hostname: "scummweb.tsilva.eu" } } });
  t.after(() => previous ? Object.defineProperty(globalThis, "window", previous) : delete globalThis.window);
  const writer = new ZipWriter(new BlobWriter());
  await writer.add("sky.dnr", new Uint8ArrayReader(Uint8Array.of(1)));
  const archive = await writer.close();
  const fetch = t.mock.method(globalThis, "fetch", async () => new Response(archive));
  assert.deepEqual(await materialize(await readCatalogGameArchive(`${customUrl}/sky.zip`)), await materialize(await readCatalogGameArchive(`${customUrl}/sky.zip`)));
  assert.equal(fetch.mock.callCount(), 1);
});

test("invalid, incomplete and canceled downloads never enter the game cache", async (t) => {
  const { entries } = installGameZipCache(t);
  const fetch = t.mock.method(globalThis, "fetch", async () => new Response("invalid ZIP"));
  await assert.rejects(readRemoteGameArchive(`${customUrl}/invalid.zip`), /readable ZIP/);
  assert.equal(entries.size, 0);
  fetch.mock.mockImplementation(async () => new Response(new ReadableStream({
    start(controller) { controller.error(new Error("connection interrupted")); },
  })));
  await assert.rejects(readRemoteGameArchive(`${customUrl}/partial.zip`), /connection interrupted/);
  assert.equal(entries.size, 0);
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(readRemoteGameArchive(`${customUrl}/canceled.zip`, { signal: controller.signal }), { name: "AbortError" });
  assert.equal(entries.size, 0);
  assert.equal(fetch.mock.callCount(), 2);
});

test("cache read and write failures leave downloads usable", async (t) => {
  const { cache } = installGameZipCache(t);
  const writer = new ZipWriter(new BlobWriter());
  await writer.add("sky.dnr", new Uint8ArrayReader(Uint8Array.of(1)));
  const archive = await writer.close();
  t.mock.method(globalThis, "fetch", async () => new Response(archive));
  t.mock.method(cache, "match", async () => { throw new Error("Storage blocked"); });
  t.mock.method(cache, "put", async () => { throw new Error("Quota exceeded"); });
  assert.equal((await readRemoteGameArchive(`${customUrl}/sky.zip`))[0].path, "sky.dnr");
});

test("the game ZIP cache evicts the oldest stored ZIP when adding a fifth archive", async (t) => {
  const { entries } = installGameZipCache(t);
  const writer = new ZipWriter(new BlobWriter());
  await writer.add("sky.dnr", new Uint8ArrayReader(Uint8Array.of(1)));
  const archive = await writer.close();
  const fetch = t.mock.method(globalThis, "fetch", async () => new Response(archive));
  for (let index = 0; index <= maxCachedGameZips; index++) {
    await readRemoteGameArchive(`${customUrl}/sky.zip?v=${index}`);
    await readCachedGameData(`${customUrl}/sky.zip?v=${index}`);
  }
  assert.equal(entries.size, maxCachedGameZips);
  assert.equal(entries.has(`${customUrl}/sky.zip?v=0`), false);
  await readRemoteGameArchive(`${customUrl}/sky.zip?v=${maxCachedGameZips}`);
  assert.equal(fetch.mock.callCount(), maxCachedGameZips + 1);
});

test("a legacy cached ZIP is migrated once to a verified installation with identical file identities", async (t) => {
  const { stores } = installGameZipCache(t);
  const writer = new ZipWriter(new BlobWriter());
  await writer.add("Game/sky.dnr", new Uint8ArrayReader(Uint8Array.of(1, 2, 3)));
  const archive = await writer.close();
  const url = `${customUrl}/legacy.zip`;
  await cacheGameZip(url, archive);
  const fetch = t.mock.method(globalThis, "fetch", () => { throw new Error("No download expected"); });
  const identities = [];
  const first = await readRemoteGameArchive(url, { onEntries: (entries) => identities.push(entries) });
  // The player transfers ownership of these bytes. Background persistence must
  // already hold a snapshot before that detaches the source ArrayBuffers.
  const transferred = structuredClone(first, { transfer: first.map(({ data }) => data.buffer) });
  const warm = await readRemoteGameArchive(url, { onEntries: (entries) => identities.push(entries) });
  assert.deepEqual(await materialize(warm), transferred);
  assert.deepEqual(identities[1], identities[0]);
  assert.equal(fetch.mock.callCount(), 0);
  assert.equal(stores.get("scummweb.game-files.v2").entries.size, 1);
  assert.equal(stores.get("scummweb.game-zips.v1").entries.size, 0, "migration removes the duplicate ZIP");
});

test("eviction bounds atomic prepared installations without retaining extra manifests", async (t) => {
  const { stores } = installGameZipCache(t);
  const writer = new ZipWriter(new BlobWriter());
  await writer.add("game.dat", new Uint8ArrayReader(Uint8Array.of(1)));
  const archive = await writer.close();
  t.mock.method(globalThis, "fetch", async () => new Response(archive));
  for (let index = 0; index < maxCachedGameZips + 2; index++) {
    const url = `${customUrl}/evict-${index}.zip`;
    await readRemoteGameArchive(url);
    await readCachedGameData(url);
  }
  assert.equal(stores.get("scummweb.game-files.v2").entries.size, maxCachedGameZips);
  assert.equal(stores.get("scummweb.game-zips.v1").entries.size, 0);
});

test("prepared-cache quota failures retain the original ZIP as a usable fallback", async (t) => {
  const { cache } = installGameZipCache(t);
  t.mock.method(cache, "put", async () => { throw new Error("Quota exceeded"); });
  const writer = new ZipWriter(new BlobWriter());
  await writer.add("game.dat", new Uint8ArrayReader(Uint8Array.of(1, 2)));
  const archive = await writer.close();
  const url = `${customUrl}/fallback.zip`;
  const fetch = t.mock.method(globalThis, "fetch", async () => new Response(archive));
  const original = await readRemoteGameArchive(url);
  const cached = await readCachedGameData(url);
  assert.equal(cached.manifest, undefined);
  assert.equal(cached.archive.size, archive.size);
  assert.deepEqual(await readRemoteGameArchive(url), original);
  await readCachedGameData(url);
  assert.equal(fetch.mock.callCount(), 1);
});

test("a truncated prepared-cache header falls back to a fresh validated download", async (t) => {
  const { cache } = installGameZipCache(t);
  const writer = new ZipWriter(new BlobWriter());
  await writer.add("game.dat", new Uint8ArrayReader(Uint8Array.of(4, 5, 6)));
  const archive = await writer.close();
  const url = `${customUrl}/recover.zip`;
  const fetch = t.mock.method(globalThis, "fetch", async () => new Response(archive));
  await readRemoteGameArchive(url);
  await readCachedGameData(url);
  await cache.put(url, new Response(Uint8Array.of(255, 255, 255, 255), {
    headers: { "content-type": "application/x-scummweb-game-files" },
  }));
  const recovered = await readRemoteGameArchive(url);
  assert.deepEqual(recovered, [{ path: "game.dat", data: Uint8Array.of(4, 5, 6) }]);
  await readCachedGameData(url);
  assert.equal(fetch.mock.callCount(), 2);
});
