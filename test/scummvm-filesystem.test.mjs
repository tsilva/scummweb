import assert from "node:assert/strict";
import test from "node:test";

for (const source of ["web-shell", "scummvm-shell"]) {
  const { ScummvmFS, LocalGameFS } = await import(`../${source}/scummvm_fs.js`);
  test(`${source} small-file prewarming preserves the byte budget and LRU eviction`, async (t) => {
    const block = 256 * 1024;
    const data = new Uint8Array(1024 * 1024).fill(17);
    const fs = new LocalGameFS(null, [
      ...Array.from({ length: 10 }, (_, i) => ({ path: `file${i}.dat`, blob: new Blob([data]) })),
      { path: "nested/tiny.dat", blob: new Blob([Uint8Array.of(1)]) },
      { path: "large.dat", blob: new Blob(Array(12).fill(data)) },
    ]);
    await fs.prefetchSmallFiles();
    assert.equal(fs.cachedBytes, 8 * 1024 * 1024);
    assert.equal(fs.cache.has("/nested/tiny.dat\0" + 0), false, "root files take priority within the budget");
    for (const bytes of fs.cache.values()) assert.equal(bytes.buffer.byteLength, bytes.length, "blocks must own their storage for bounded eviction");
    const fallback = t.mock.method(fs, "readBlock", () => { throw new Error("Unexpected disk read"); });
    assert.deepEqual(fs.read({ path: "/file0.dat", start: block - 3, end: block + 7 }).data, new Uint8Array(11).fill(17));
    assert.equal(fallback.mock.callCount(), 0);
    const oldest = fs.cache.keys().next().value;
    fs.cacheBlock("extra", new Uint8Array(block));
    assert.equal(fs.cache.has(oldest), false);
    assert.equal(fs.cachedBytes, 8 * 1024 * 1024);
  });

  test(`${source} an optional prewarm failure keeps ordinary file reads available`, async (t) => {
    class UnavailableBlob extends Blob { async arrayBuffer() { throw new Error("Disk unavailable"); } }
    const fs = new LocalGameFS(null, [{ path: "game.dat", blob: new UnavailableBlob([Uint8Array.of(9)]) }]);
    await fs.prefetchSmallFiles();
    const fallback = t.mock.method(fs, "readBlock", () => Uint8Array.of(9));
    assert.deepEqual(fs.read({ path: "/game.dat", start: 0, end: 0 }).data, Uint8Array.of(9));
    assert.equal(fallback.mock.callCount(), 1);
  });
  for (const status of [200, 206]) {
    test(`${source} decodes HTTP ${status} once and caches exact block boundaries`, (t) => {
      const boundary = 1024 * 1024;
      const bytes = Uint8Array.from({ length: 2 * boundary + 73 }, (_, i) => i % 256);
      const requests = [];
      const oldDocument = Object.getOwnPropertyDescriptor(globalThis, "document");
      Object.defineProperty(globalThis, "document", { configurable: true, value: { baseURI: "https://example.test/scummvm.html" } });
      class Request {
        open(method, _url, async) { assert.equal(method, "GET"); assert.equal(async, false); }
        overrideMimeType(type) { assert.match(type, /x-user-defined/); }
        setRequestHeader(name, value) { assert.equal(name, "Range"); this.range = value; }
        send() {
          requests.push(this.range);
          const [, first, last] = /^bytes=(\d+)-(\d+)$/.exec(this.range);
          const body = status === 200 ? bytes : bytes.subarray(Number(first), Number(last) + 1);
          this.responseText = Buffer.from(body).toString("latin1");
          this.status = status;
          this.readyState = 4;
          this.onreadystatechange();
        }
      }
      const oldRequest = Object.getOwnPropertyDescriptor(globalThis, "XMLHttpRequest");
      Object.defineProperty(globalThis, "XMLHttpRequest", { configurable: true, value: Request });
      t.after(() => {
        oldDocument ? Object.defineProperty(globalThis, "document", oldDocument) : delete globalThis.document;
        oldRequest ? Object.defineProperty(globalThis, "XMLHttpRequest", oldRequest) : delete globalThis.XMLHttpRequest;
      });
      const fs = new ScummvmFS({ ErrnoError: Error }, { url: "/data", json: { "file.dat": bytes.length } });
      fs.get({ path: "/file.dat" });
      assert.deepEqual(fs.read({ path: "/file.dat", start: boundary + 5, end: bytes.length - 1 }).data, bytes.slice(boundary + 5));
      assert.deepEqual(fs.read({ path: "/file.dat", start: 2 * boundary - 5, end: bytes.length + 20 }).data, bytes.slice(2 * boundary - 5));
      assert.equal(requests.length, 1, "subsequent reads reuse the decoded blocks");
    });
  }
  test(`${source} engine prefetch fills shared blocks and preserves exact range reads`, async (t) => {
    const previous = Object.getOwnPropertyDescriptor(globalThis, "document");
    const oldVersions = Object.getOwnPropertyDescriptor(globalThis, "SCUMMWEB_RUNTIME_ASSETS");
    Object.defineProperty(globalThis, "document", { configurable: true, value: { baseURI: "https://example.test/scummvm.html?v=bundle" } });
    Object.defineProperty(globalThis, "SCUMMWEB_RUNTIME_ASSETS", { configurable: true, value: { "/data/plugins/libdreamweb.so": "sha-engine" } });
    t.after(() => {
      previous ? Object.defineProperty(globalThis, "document", previous) : delete globalThis.document;
      oldVersions ? Object.defineProperty(globalThis, "SCUMMWEB_RUNTIME_ASSETS", oldVersions) : delete globalThis.SCUMMWEB_RUNTIME_ASSETS;
    });
    const boundary = 1024 * 1024;
    const bytes = Uint8Array.from({ length: boundary + 7 }, (_, i) => i % 251);
    const filesystem = new ScummvmFS(null, { url: "/data", json: { plugins: { "libdreamweb.so": bytes.length } } });
    const fetch = t.mock.method(globalThis, "fetch", async (url) => {
      assert.equal(url, "https://example.test/data/plugins/libdreamweb.so?v=sha-engine");
      return new Response(bytes);
    });
    const download = t.mock.method(filesystem, "download", () => { throw new Error("No synchronous download expected"); });
    assert.equal(await filesystem.prefetch("/plugins/libdreamweb.so"), true);
    assert.deepEqual(filesystem.read({ path: "/plugins/libdreamweb.so", start: boundary - 3, end: boundary + 4 }).data, bytes.slice(boundary - 3, boundary + 5));
    assert.deepEqual(filesystem.read({ path: "/plugins/libdreamweb.so", start: boundary + 4, end: boundary + 20 }).data, bytes.slice(boundary + 4));
    assert.equal(fetch.mock.callCount(), 1);
    assert.equal(download.mock.callCount(), 0);
    const prefix = new ScummvmFS(null, { url: "/data", json: { plugins: { "libdreamweb.so": bytes.length } } });
    fetch.mock.mockImplementation(async (_url, { headers }) => {
      assert.equal(headers.Range, `bytes=0-${boundary - 1}`);
      return new Response(bytes.subarray(0, boundary), { status: 206,
        headers: { "content-range": `bytes 0-${boundary - 1}/${bytes.length}` } });
    });
    assert.equal(await prefix.prefetch("/plugins/libdreamweb.so", { maxBytes: boundary }), true);
    assert.deepEqual(prefix.read({ path: "/plugins/libdreamweb.so", start: 7, end: 14 }).data, bytes.slice(7, 15));
    assert.equal(prefix.fs_index["/plugins/libdreamweb.so"].data[1], undefined, "prefix prefetch does not download the rest");
    const invalid = new ScummvmFS(null, { url: "/data", json: { plugins: { "libdreamweb.so": bytes.length } } });
    fetch.mock.mockImplementation(async () => new Response(bytes.subarray(0, boundary), { status: 206,
      headers: { "content-range": `bytes 1-${boundary}/${bytes.length}` } }));
    assert.equal(await invalid.prefetch("/plugins/libdreamweb.so", { maxBytes: boundary }), false, "a mismatched range cannot populate the cache");
    assert.equal(invalid.fs_index["/plugins/libdreamweb.so"].data[0], undefined);
    fetch.mock.mockImplementation(async () => new Response("truncated"));
    const fallback = new ScummvmFS(null, { url: "/data", json: { plugins: { "libdreamweb.so": bytes.length } } });
    assert.equal(await fallback.prefetch("/plugins/libdreamweb.so"), false);
    const readFallback = t.mock.method(fallback, "download", () => Uint8Array.of(4));
    assert.deepEqual(fallback.read({ path: "/plugins/libdreamweb.so", start: 0, end: 0 }).data, Uint8Array.of(4));
    assert.equal(readFallback.mock.callCount(), 1);
  });
  for (const Filesystem of [ScummvmFS, LocalGameFS]) {
    test(`${source} ${Filesystem.name} reads return zero at and beyond EOF`, (t) => {
      const data = Uint8Array.of(1, 2, 3);
      const filesystem = Filesystem === LocalGameFS
        ? new LocalGameFS(null, [{ path: "game.dat", data }])
        : new ScummvmFS(null, { json: { "game.dat": data.length } });
      const root = { mount: { opts: { root: "" } } };
      root.parent = root;
      const stream = {
        node: { name: "game.dat", parent: root },
        fileData: filesystem.get({ path: "/game.dat" }).data,
        fileSize: data.length,
        position: 0,
      };
      const read = t.mock.method(filesystem, "read", ({ start, end }) => ({
        ok: true, data: data.slice(start, end + 1),
      }));

      for (const position of [data.length, data.length + 1, 1024]) {
        stream.position = position;
        const buffer = new Uint8Array(4).fill(99);
        assert.equal(filesystem.stream_ops.read(stream, buffer, 1, 2), 0);
        assert.deepEqual(buffer, new Uint8Array(4).fill(99));
      }
      assert.equal(read.mock.callCount(), 0, "EOF must not access file data");

      const buffer = new Uint8Array(4).fill(99);
      assert.equal(filesystem.stream_ops.read(stream, buffer, 1, 2, 2), 1);
      assert.deepEqual(buffer, Uint8Array.of(99, 3, 99, 99));
      assert.equal(read.mock.callCount(), 1);
    });
  }
}
