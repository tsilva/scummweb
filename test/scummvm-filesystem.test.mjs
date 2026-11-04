import assert from "node:assert/strict";
import test from "node:test";

for (const source of ["web-shell", "scummvm-shell"]) {
  const { ScummvmFS, LocalGameFS } = await import(`../${source}/scummvm_fs.js`);
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
