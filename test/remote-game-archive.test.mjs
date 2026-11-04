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
  for (const [files, title] of [
    [[["Packet.001", 32847563, 1048178371]], "Dráscula: The Vampire Strikes Back"],
    [[["Disk1.vga", 618944, 893859565], ["Disk2.vga", 659616, 4000140536]], "Lure of the Temptress"],
    [[["queen.1", 190787021, 501481959]], "Flight of the Amazon Queen"],
    [[["DISK0", 208437, 4075295742], ["DISK1", 901120, 3732423185]], "Nippon Safes, Inc."],
  ]) assert.equal(getArchiveGamePresentation(files)?.displayTitle, title);
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

test("oversized directory responses are canceled before buffering and use the normal download", async (t) => {
  const bytes = await makeZip();
  let canceled = false;
  let downloads = 0;
  t.mock.method(globalThis, "fetch", async (_url, options) => {
    if (options.headers?.Range) return new Response(new ReadableStream({
      cancel() { canceled = true; },
    }), { status: 206, headers: { "content-range": "bytes 0-3145727/4194304" } });
    downloads++;
    return new Response(bytes);
  });
  const archive = await prepareRemoteGameArchive(url);
  assert.equal(canceled, true);
  assert.equal(archive.game.target, "sky");
  await archive.loadArchive();
  assert.equal(downloads, 1);
});

test("oversized or unsafe archives fail inspection without a full-download retry", async (t) => {
  const fetch = t.mock.method(globalThis, "fetch", async (_url, options) => options.headers?.Range
    ? new Response(Uint8Array.of(0), { status: 206, headers: { "content-range": `bytes 0-0/${maxArchiveSize + 1}` } })
    : new Response(Uint8Array.of(0), { headers: { "content-length": String(maxArchiveSize + 1) } }));
  await assert.rejects(prepareRemoteGameArchive(url), /128 MiB/);
  assert.equal(fetch.mock.callCount(), 1);

  const bytes = Buffer.from(await makeZip(["xx/sky.dnr"]));
  for (let index = bytes.indexOf("xx/sky.dnr"); index !== -1; index = bytes.indexOf("xx/sky.dnr")) {
    bytes.write("../sky.dnr", index);
  }
  fetch.mock.mockImplementation(async (_url, options) => rangeResponse(bytes, options));
  await assert.rejects(prepareRemoteGameArchive(url), /invalid file path/);
  assert.ok(fetch.mock.calls.every(({ arguments: [, options] }) => options.headers?.Range));
});

test("HTTP errors fail after one request and cancel the error body", async (t) => {
  for (const status of [400, 401, 403, 404, 410, 429, 500, 503]) {
    let canceled = false;
    const fetch = t.mock.method(globalThis, "fetch", async () => new Response(new ReadableStream({
      cancel() { canceled = true; },
    }), { status }));
    await assert.rejects(prepareRemoteGameArchive(url), new RegExp(`HTTP ${status}`));
    assert.equal(fetch.mock.callCount(), 1);
    assert.equal(canceled, true);
    fetch.mock.restore();
  }
});

test("explicitly unsupported range requests still get one full-download fallback", async (t) => {
  const bytes = await makeZip();
  for (const status of [405, 416, 501]) {
    const fetch = t.mock.method(globalThis, "fetch", async (_url, options) =>
      options.headers?.Range ? new Response(null, { status }) : new Response(bytes));
    assert.equal((await prepareRemoteGameArchive(url)).game.target, "sky");
    assert.equal(fetch.mock.callCount(), 2);
    fetch.mock.restore();
  }
});

test("range-specific network or CORS failures allow one ordinary GET", async (t) => {
  const bytes = await makeZip();
  const fetch = t.mock.method(globalThis, "fetch", async (_url, options) => {
    if (options.headers?.Range) throw new TypeError("Failed to fetch");
    return new Response(bytes);
  });
  assert.equal((await prepareRemoteGameArchive(url)).game.target, "sky");
  assert.equal(fetch.mock.callCount(), 2);
});

test("HTML and JSON responses are rejected from headers without buffering their body", async (t) => {
  for (const type of ["text/html; charset=utf-8", "application/xhtml+xml", "application/json", "application/problem+json"]) {
    let canceled = false;
    const fetch = t.mock.method(globalThis, "fetch", async () => new Response(new ReadableStream({
      cancel() { canceled = true; },
    }), { headers: { "content-type": type } }));
    await assert.rejects(prepareRemoteGameArchive(url), /instead of a game ZIP/);
    assert.equal(fetch.mock.callCount(), 1);
    assert.equal(canceled, true);
    fetch.mock.restore();
  }
});

test("corrupt ZIP contents and unsafe archive metadata do not trigger a full download", async (t) => {
  const valid = Buffer.from(await makeZip());
  const centralHeader = Buffer.from([0x50, 0x4b, 0x01, 0x02]);
  const encrypted = Buffer.from(valid);
  encrypted.writeUInt16LE(encrypted.readUInt16LE(encrypted.indexOf(centralHeader) + 8) | 1, encrypted.indexOf(centralHeader) + 8);
  const expanded = Buffer.from(valid);
  expanded.writeUInt32LE(256 * 1024 * 1024 + 1, expanded.indexOf(centralHeader) + 24);
  const symlink = Buffer.from(valid);
  const offset = symlink.indexOf(centralHeader);
  symlink[offset + 5] = 3; // UNIX creator with a symbolic-link mode.
  symlink.writeUInt32LE(0xa1ff0000, offset + 38);
  for (const [bytes, message] of [
    [Buffer.from("<script>throw new Error('Untrusted code');</script>"), /not a readable ZIP/],
    [encrypted, /Password-protected/], [expanded, /when unpacked/], [symlink, /symbolic links/],
  ]) {
    const fetch = t.mock.method(globalThis, "fetch", async (_url, options) => {
      assert.ok(options.headers?.Range, "bad ZIPs must never retry a full GET");
      return rangeResponse(bytes, options);
    });
    await assert.rejects(prepareRemoteGameArchive(url), message);
    fetch.mock.restore();
  }
});

test("inspection timeouts stop instead of starting a longer download", async (t) => {
  t.mock.method(AbortSignal, "timeout", () => AbortSignal.abort(new DOMException("Timed out", "TimeoutError")));
  const fetch = t.mock.method(globalThis, "fetch", async () => { throw new Error("No request expected"); });
  await assert.rejects(prepareRemoteGameArchive(url), /inspection timed out/);
  assert.equal(fetch.mock.callCount(), 0);
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
