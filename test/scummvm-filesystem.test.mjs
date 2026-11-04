import assert from "node:assert/strict";
import test from "node:test";

for (const source of ["web-shell", "scummvm-shell"]) {
  const { ScummvmFS, LocalGameFS } = await import(`../${source}/scummvm_fs.js`);
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
