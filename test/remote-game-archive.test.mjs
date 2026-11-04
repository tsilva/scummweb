import assert from "node:assert/strict";
import test from "node:test";
import { BlobWriter, Uint8ArrayReader, ZipWriter } from "@zip.js/zip.js";
import { getArchiveGamePresentation } from "../app/archive-game-presentation.mjs";
import { inspectRemoteGameArchive, prepareRemoteGameArchive } from "../app/remote-game-archive.mjs";
import { maxArchiveSize } from "../app/local-game-archive.mjs";

const url = "https://example.com/completely-renamed.zip?download=1";

async function makeZip(paths = ["wrapper/SKY.DNR", "wrapper/SKY.DSK"]) {
  const writer = new ZipWriter(new BlobWriter());
  for (const path of paths) {
    await writer.add(path, new Uint8ArrayReader(new Uint8Array(70_000)), { level: 0 });
  }
  return new Uint8Array(await (await writer.close()).arrayBuffer());
}

function rangeResponse(bytes, options) {
  const range = /^bytes=(?:(\d+)-(\d+)|-(\d+))$/.exec(options.headers.Range);
  assert.ok(range, "each inspection request must have a byte range");
  const start = range[3] ? Math.max(0, bytes.length - Number(range[3])) : Number(range[1]);
  const end = range[3] ? bytes.length - 1 : Math.min(bytes.length - 1, Number(range[2]));
  return new Response(bytes.slice(start, end + 1), {
    status: 206,
    headers: { "content-range": `bytes ${start}-${end}/${bytes.length}` },
  });
}

test("contents identify renamed, wrapped and case-insensitive game archives", () => {
  const game = getArchiveGamePresentation([["any/folder/SKY.DNR", 100], ["any/folder/sky.dsk", 200]]);
  assert.equal(game.displayTitle, "Beneath a Steel Sky");
  assert.match(game.heroImage, /sky-hero\.webp/);
  assert.equal(game.studio, "Revolution Software");
  assert.equal(game.badge, "Remote game");
  assert.equal(game.platform, undefined);
});

test("shared filenames require known size and CRC signatures, including demo titles", () => {
  const files = [["000.lfl", 7607, 0x719585d5], ["disk01.lec", 266281, 0x2afb1b41]];
  assert.equal(getArchiveGamePresentation(files).displayTitle, "The Secret of Monkey Island (Demo)");
  assert.equal(getArchiveGamePresentation(files.map(([name, size]) => [name, size, 0])), null);
  assert.equal(getArchiveGamePresentation([["00.lfl", 5361, 0x1145ddda], ["01.lfl", 43865, 0x373099bb]]).target, "indy3");
});

test("unknown, incomplete, empty, split-directory and multiple-game archives stay generic", () => {
  for (const files of [
    [["resource.map", 100]], [["sky.dnr", 100]], [["sky.dnr", 0], ["sky.dsk", 100]],
    [["one/sky.dnr", 100], ["two/sky.dsk", 100]],
    [["sky.dnr", 100], ["sky.dsk", 100], ["tentacle.000", 100], ["tentacle.001", 100]],
  ]) assert.equal(getArchiveGamePresentation(files), null);
});

test("range inspection reads the ZIP directory before the full download and reuses existing metadata", async (t) => {
  const bytes = await makeZip();
  let readBytes = 0;
  let fullDownloads = 0;
  t.mock.method(globalThis, "fetch", async (requestUrl, options) => {
    assert.equal(requestUrl, url);
    assert.equal(options.credentials, "omit");
    assert.equal(options.redirect, "error");
    assert.equal(options.referrerPolicy, "no-referrer");
    assert.equal(options.mode, "cors");
    if (!options.headers?.Range) {
      fullDownloads++;
      return new Response(bytes);
    }
    const response = rangeResponse(bytes, options);
    readBytes += Number(response.headers.get("content-range").split("-")[1].split("/")[0]) -
      Number(response.headers.get("content-range").split(" ")[1].split("-")[0]) + 1;
    return response;
  });
  const prepared = await prepareRemoteGameArchive(url);
  assert.equal(prepared.game.target, "sky");
  assert.equal(fullDownloads, 0);
  assert.ok(readBytes < bytes.length / 2);
  const files = await prepared.loadArchive(new AbortController().signal);
  assert.equal(fullDownloads, 1);
  assert.deepEqual(files.map(({ path }) => path), ["SKY.DNR", "SKY.DSK"]);
});

test("hosts ignoring ranges cancel the probe and download once for identification and launch", async (t) => {
  const bytes = await makeZip();
  let canceled = false;
  let downloads = 0;
  let downloading = false;
  t.mock.method(globalThis, "fetch", async (_url, options) => {
    if (options.headers?.Range) return new Response(new ReadableStream({
      cancel() { canceled = true; },
    }));
    downloads++;
    return new Response(bytes);
  });
  const archive = await prepareRemoteGameArchive(url, { onDownloading: () => { downloading = true; } });
  assert.equal(canceled, true);
  assert.equal(downloading, true);
  assert.equal(archive.game.target, "sky");
  await archive.loadArchive();
  await archive.loadArchive();
  assert.equal(downloads, 1);
});

test("unavailable range headers fall back without breaking unknown game launches", async (t) => {
  const bytes = await makeZip(["resource.map"]);
  t.mock.method(globalThis, "fetch", async (_url, options) => options.headers?.Range
    ? new Response(Uint8Array.of(0), { status: 206 }) : new Response(bytes));
  const archive = await prepareRemoteGameArchive(url);
  assert.equal(archive.game, null);
  assert.equal((await archive.loadArchive())[0].path, "resource.map");
});

test("range inspection and fallback preserve archive size and path safety limits", async (t) => {
  const fetch = t.mock.method(globalThis, "fetch", async (_url, options) => options.headers?.Range
    ? new Response(Uint8Array.of(0), { status: 206, headers: { "content-range": `bytes 0-0/${maxArchiveSize + 1}` } })
    : new Response(Uint8Array.of(0), { headers: { "content-length": String(maxArchiveSize + 1) } }));
  await assert.rejects(prepareRemoteGameArchive(url), /128 MiB/);
  assert.equal(fetch.mock.callCount(), 2);

  const bytes = Buffer.from(await makeZip(["xx/sky.dnr"]));
  for (let index = bytes.indexOf("xx/sky.dnr"); index !== -1; index = bytes.indexOf("xx/sky.dnr")) {
    bytes.write("../sky.dnr", index);
  }
  fetch.mock.mockImplementation(async (_url, options) => rangeResponse(bytes, options));
  await assert.rejects(inspectRemoteGameArchive(url), /invalid file path/);
});

test("aborted identification does not retry a full download", async (t) => {
  const controller = new AbortController();
  const fetch = t.mock.method(globalThis, "fetch", async () => {
    controller.abort();
    throw controller.signal.reason;
  });
  await assert.rejects(prepareRemoteGameArchive(url, { signal: controller.signal }), { name: "AbortError" });
  assert.equal(fetch.mock.callCount(), 1);
});
