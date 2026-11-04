import assert from "node:assert/strict";
import test from "node:test";
import { BlobWriter, Uint8ArrayReader, ZipWriter } from "@zip.js/zip.js";
import { localGame } from "../app/game-sources.mjs";
import { fileNode, prepareLocalFolder, prepareLocalZip } from "../app/local-game-import.mjs";
import { findLocalGameSource } from "../app/local-game-matching.mjs";

async function zipGame(name, contents = [1, 2]) {
  const zip = new ZipWriter(new BlobWriter());
  await zip.add("data/vol.cat", new Uint8ArrayReader(Uint8Array.from(contents)));
  return prepareLocalZip(fileNode(new File([await zip.close()], name)));
}

test("dropping a library repeatedly without handles keeps one entry per game, including after reload", async () => {
  const games = await Promise.all([zipGame("Sfinx.zip"), zipGame("Other.zip", [3, 4])]);
  const saved = new Map();
  for (let drop = 0; drop < 3; drop++) {
    for (const game of [...games, games[0]]) {
      const existing = await findLocalGameSource(game, saved.values());
      const source = localGame(null, game, existing?.id);
      // Only source metadata survives reload; File objects are not saved.
      saved.set(source.id, structuredClone(source));
    }
    assert.equal(saved.size, 2);
  }
});

test("ZIP fingerprints identify moved copies but keep different same-name editions separate", async () => {
  const game = await zipGame("Game.zip");
  const source = localGame(null, game, "original");
  const copy = await zipGame("Renamed.zip");
  assert.equal(await findLocalGameSource(copy, [source]), source);
  const otherEdition = await zipGame("Game.zip", [3, 4]);
  assert.notEqual(game.fingerprint, otherEdition.fingerprint);
  assert.equal(await findLocalGameSource(otherEdition, [source]), null);
});

test("stale handles do not stop a missing game from reconnecting to a fresh handle", async () => {
  const game = await zipGame("Game.zip");
  const source = localGame({ kind: "file" }, game, "original");
  const freshHandle = {
    kind: "file",
    isSameEntry: async () => { throw new DOMException("File not found", "NotFoundError"); },
  };
  game.handle = freshHandle;
  const existing = await findLocalGameSource(game, [source]);
  const refreshed = localGame(game.handle, game, existing.id);
  assert.equal(refreshed.id, source.id);
  assert.equal(refreshed.handle, freshHandle);
});

test("handle identity wins over fingerprints and changed contents", async () => {
  const handle = { kind: "file" };
  const source = { id: "original", name: "Old.zip", handle, fingerprint: "old" };
  const game = {
    name: "Renamed.zip", kind: "zip", fingerprint: "new",
    handle: { kind: "file", isSameEntry: async (other) => other === handle },
  };
  assert.equal(await findLocalGameSource(game, [source]), source);
});

test("legacy entries reuse their ID regardless of availability, while remote and folder entries stay separate", async () => {
  const game = await zipGame("Game.zip");
  const source = { id: "legacy", name: game.name };
  const remote = { id: "remote", name: game.name, url: "https://example.com/Game.zip" };
  const folder = { id: "folder", name: game.name, kind: "folder" };
  assert.equal(await findLocalGameSource(game, [remote, folder, source]), source);
  assert.equal(await findLocalGameSource(game, [remote, folder]), null);
  await assert.rejects(findLocalGameSource(game, [source, { ...source, id: "duplicate" }]), /Several library entries/);
});

test("a missing entry can be repaired with a more complete same-name copy", async () => {
  const game = await zipGame("Game.zip");
  const source = { id: "missing", name: game.name, fingerprint: "incomplete" };
  assert.equal(await findLocalGameSource(game, [source], new Set([source.id])), source);
});

test("folder fingerprints survive reordered scans and a new enclosing folder", async () => {
  const nodes = ["disc1/vol.cat", "disc2/vol.dat"].map((path) => ({
    path, getFile: async () => new File([path], path.split("/").at(-1), { lastModified: 1234 }),
  }));
  const game = await prepareLocalFolder({ name: "Game" }, nodes);
  const copy = await prepareLocalFolder({ name: "Moved game" }, nodes.toReversed().map((node) =>
    ({ ...node, path: `new-wrapper/${node.path}` })
  ));
  const source = localGame(null, game, "folder");
  assert.equal(await findLocalGameSource(copy, [source]), source);
});
