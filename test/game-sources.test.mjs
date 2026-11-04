import assert from "node:assert/strict";
import test from "node:test";
import { bucketGames, checkGameSource, localGame, remoteGame } from "../app/game-sources.mjs";

test("availability checks read file metadata only with existing permission", async () => {
  const file = new File(["test"], "adventure.zip");
  let permission = "prompt";
  let missing = false;
  let reads = 0;
  const handle = {
    async queryPermission(options) {
      assert.deepEqual(options, { mode: "read" });
      return permission;
    },
    async getFile() {
      reads++;
      if (missing) throw new DOMException("File moved", "NotFoundError");
      return file;
    },
  };
  const source = localGame(handle, file, "game");
  assert.deepEqual(source, { id: "game", name: file.name, handle });
  assert.equal(await checkGameSource(source), "permission");
  assert.equal(reads, 0);

  permission = "granted";
  assert.equal(await checkGameSource(source), "available");
  missing = true;
  assert.equal(await checkGameSource(source), "missing");

  const unlinked = localGame(null, file, "game");
  assert.deepEqual(unlinked, { id: "game", name: file.name });
  assert.equal(await checkGameSource(unlinked), "locate");
});

test("bucket discoveries and direct links share a URL identity and recheck without downloading", async (t) => {
  const base = "https://games.example.com";
  const [discovered] = bucketGames(base, ["sky"], [{ target: "sky" }]);
  const direct = remoteGame(`${base}/sky.zip`);
  assert.equal(discovered.id, direct.id);
  const head = t.mock.method(globalThis, "fetch", async (url, options) => {
    assert.equal(url, direct.url);
    assert.equal(options.method, "HEAD");
    assert.equal(options.credentials, "omit");
    return new Response(null, { status: 404 });
  });
  assert.equal(await checkGameSource(discovered), "missing");
  assert.equal(head.mock.callCount(), 1);
});

test("folder checks detect removal and recovery without reading game contents", async () => {
  let missing = false;
  let files = [{ name: "sky.dsk", kind: "file" }];
  const source = localGame({
    queryPermission: async () => "granted",
    async *values() {
      if (missing) throw new DOMException("Folder moved or drive disconnected", "NotFoundError");
      yield* files;
    },
  }, { name: "Beneath a Steel Sky", kind: "folder" });

  assert.equal(await checkGameSource(source), "available");
  missing = true;
  assert.equal(await checkGameSource(source), "missing");
  missing = false;
  assert.equal(await checkGameSource(source), "available");
  files = [{ name: ".DS_Store", kind: "file" }];
  assert.equal(await checkGameSource(source), "missing");
});

test("permission failures and unreadable sources are not falsely marked missing", async () => {
  for (const kind of ["zip", "folder"]) {
    for (const [name, expected] of [
      ["NotAllowedError", "permission"],
      ["SecurityError", "permission"],
      ["NotFoundError", "missing"],
      ["NotReadableError", "unverified"],
      ["UnknownError", "unverified"],
    ]) {
      const fail = () => { throw new DOMException("Cannot access game", name); };
      const source = localGame({
        queryPermission: async () => "granted",
        getFile: fail,
        async *values() { fail(); },
      }, { name: kind === "zip" ? "game.zip" : "Game", kind });
      assert.equal(await checkGameSource(source), expected, `${kind}: ${name}`);
    }
  }
});
