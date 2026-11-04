import assert from "node:assert/strict";
import test from "node:test";
import { bucketGames, checkGameSource, localGame, remoteGame, requestGameSourceAccess } from "../app/game-sources.mjs";

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

test("legacy folders require a replacement ZIP without touching the directory", async () => {
  for (const source of [
    { id: "old", name: "Game", kind: "folder" },
    { id: "old", name: "Game.zip", handle: { kind: "directory" } },
  ]) {
    if (source.handle) source.handle.queryPermission = () => assert.fail("Do not access old folders");
    assert.equal(await checkGameSource(source), "locate");
  }
});

test("new local sources reject directories and non-ZIP files", () => {
  assert.throws(() => localGame(null, { name: "Game", kind: "folder" }), /Choose a ZIP/);
  assert.throws(() => localGame({ kind: "directory" }, { name: "Game.zip" }), /Choose a ZIP/);
  assert.throws(() => localGame(null, new File(["data"], "Game.7z")), /Choose a ZIP/);
});

test("permission failures and unreadable sources are not falsely marked missing", async () => {
  for (const [name, expected] of [
    ["NotAllowedError", "permission"],
    ["SecurityError", "permission"],
    ["NotFoundError", "missing"],
    ["NotReadableError", "unverified"],
    ["UnknownError", "unverified"],
  ]) {
    const source = localGame({
      queryPermission: async () => "granted",
      getFile: () => { throw new DOMException("Cannot access game", name); },
    }, { name: "game.zip", kind: "zip" });
    assert.equal(await checkGameSource(source), expected, name);
  }
});

test("explicit access requests run immediately and validate the ZIP after approval", async () => {
  let requested = false;
  let permission = "prompt";
  let reads = 0;
  const source = localGame({
    requestPermission(options) {
      assert.deepEqual(options, { mode: "read" });
      requested = true;
      permission = "granted";
      return Promise.resolve(permission);
    },
    queryPermission: async () => permission,
    getFile: async () => { reads++; return new File(["test"], "game.zip"); },
  }, { name: "game.zip" });
  const pending = requestGameSourceAccess(source);
  assert.equal(requested, true, "request must preserve the click's user activation");
  assert.equal(await pending, "available");
  assert.equal(reads, 1);
  source.handle.getFile = async () => { throw new DOMException("Moved", "NotFoundError"); };
  assert.equal(await requestGameSourceAccess(source), "missing");
});

test("declined or dismissed permission stays retryable without reading the ZIP", async () => {
  let attempts = 0;
  const source = { handle: {
    requestPermission: async () => { attempts++; return "denied"; },
    getFile: () => assert.fail("Do not read without permission"),
  } };
  assert.equal(await requestGameSourceAccess(source), "permission");
  assert.equal(await requestGameSourceAccess(source), "permission");
  assert.equal(attempts, 2);
  for (const name of ["NotAllowedError", "SecurityError"]) {
    source.handle.requestPermission = async () => { throw new DOMException("Denied", name); };
    assert.equal(await requestGameSourceAccess(source), "permission");
  }
});
