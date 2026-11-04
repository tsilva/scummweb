import assert from "node:assert/strict";
import test from "node:test";
import { cachePreparedGame, readCachedGameData } from "../app/game-zip-cache.mjs";
import { installGameZipCache } from "./helpers/game-zip-cache.mjs";

test("a repeat launch can reuse verified bytes while their cache write is still pending", { timeout: 1000 }, async (t) => {
  const { cache, entries } = installGameZipCache(t);
  const gate = Promise.withResolvers();
  const put = cache.put.bind(cache);
  t.mock.method(cache, "put", async (...args) => { await gate.promise; return put(...args); });
  const url = "https://example.test/game.zip";
  const files = [{ path: "game.dat", data: Uint8Array.of(1, 2, 3) }];
  const metadata = [["game.dat", 3, 123]];
  const done = cachePreparedGame(url, new Blob(["verified ZIP"]), files, metadata);
  structuredClone(files, { transfer: files.map(({ data }) => data.buffer) });
  const ready = await readCachedGameData(url, { waitForWrite: false });
  assert.deepEqual([...new Uint8Array(await ready.archive.arrayBuffer())], [1, 2, 3]);
  assert.deepEqual(ready.manifest.entries, metadata);
  assert.equal(entries.size, 0, "no disk commit was needed for the repeat launch");
  gate.resolve();
  assert.equal(await done, true);
  const persisted = await readCachedGameData(url);
  assert.deepEqual([...new Uint8Array(await persisted.archive.arrayBuffer())], [1, 2, 3]);
  assert.deepEqual(persisted.manifest, ready.manifest);
});
