import assert from "node:assert/strict";
import test from "node:test";
import { scanLocalGameArchive, openLocalGameArchive } from "../app/local-game-archive.mjs";
import { maxLocalGameSize, validateLocalGameArchive } from "../app/local-game-selection.mjs";
import { collectGameImportNodes, fileNode, handleNode, inspectLocalSourceFiles, prepareLocalArchive } from "../app/local-game-import.mjs";
import { checkGameSource, localGame, requestGameSourceAccess } from "../app/game-sources.mjs";
import { findLocalGameSource } from "../app/local-game-matching.mjs";
import { getSourceGamePresentation, prepareGameSourcePlayer } from "../app/game-play-source.mjs";
import { findBundledGame } from "../app/bundled-game-matching.mjs";
import { bothEndian, gameIso, isoRecord } from "./helpers/game-iso.mjs";

const iso = (options, name = "Sfinx.iso") => new File([gameIso(options)], name);
const signal = () => new AbortController().signal;

test("ISO 9660 imports strip versions/enclosing folders and stream CRC-32 compatible with ZIP matching", async () => {
  const file = iso();
  const game = await prepareLocalArchive(fileNode(file));
  assert.equal(game.kind, "iso");
  assert.deepEqual(game.archiveFiles, [["VOL.CAT", 9, 0xcbf43926]]);
  const [member] = await openLocalGameArchive(file, signal());
  assert.equal(member.path, "VOL.CAT");
  assert.ok(member.blob instanceof Blob);
  assert.equal(await member.blob.text(), "123456789");
  const catalog = [{ target: "test" }];
  assert.equal(findBundledGame(game, catalog, { test: { files: [["vol.cat", 9, 0xcbf43926]] } }), catalog[0]);
});

test("Joliet uses Unicode filenames from the supplementary directory", async () => {
  const file = iso({ joliet: true, filename: "Voix été.dat;1", contents: "speech" });
  const [entry] = await openLocalGameArchive(file, signal());
  assert.equal(entry.path, "Voix été.dat");
  assert.equal(await entry.blob.text(), "speech");
});

test("ISO launch reads directory sectors only and returns file-backed slices", async () => {
  const file = iso({ contents: "x".repeat(3 * 1024 * 1024) });
  const reads = [];
  const original = file.slice.bind(file);
  file.slice = (start, end) => {
    const blob = original(start, end);
    const read = blob.arrayBuffer.bind(blob);
    blob.arrayBuffer = () => { reads.push([start, end]); return read(); };
    return blob;
  };
  const [entry] = await openLocalGameArchive(file, signal());
  assert.ok(reads.every(([start, end]) => start < 30 * 2048 && end - start === 2048));
  assert.equal(entry.blob.size, 3 * 1024 * 1024);
  assert.equal((await entry.blob.text()).length, entry.blob.size);
});

test("ISO import, folder drops, reconnect, access restore and reopened player preserve source identity", async () => {
  let file = iso();
  let permission = "granted";
  const handle = { kind: "file", name: file.name, getFile: async () => file,
    queryPermission: async () => permission, requestPermission: async () => (permission = "granted") };
  const [node] = await collectGameImportNodes([handleNode({ kind: "directory", name: "Games", async *values() {
    yield { ...handle, name: "Disc.ISO" };
    yield { kind: "file", name: "notes.txt" };
  } })]);
  const game = await prepareLocalArchive(node);
  const source = localGame(handle, game, "existing-saves");
  assert.equal(source.kind, "iso");
  assert.equal(await checkGameSource(source), "available");
  assert.equal((await findLocalGameSource(await prepareLocalArchive(fileNode(new File([file], "Moved.iso"))), [source])).id, source.id);
  assert.equal(await findLocalGameSource(await prepareLocalArchive(fileNode(iso({ contents: "987654321" }))), [source]), null);
  const cache = new WeakMap();
  assert.deepEqual(await inspectLocalSourceFiles(source, cache), game.archiveFiles);
  permission = "prompt";
  const presentation = getSourceGamePresentation(source, [], []);
  assert.equal(presentation.displayTitle, "Sfinx");
  const player = await prepareGameSourcePlayer(source, presentation);
  assert.equal(player.game.saveVersionId, source.id);
  await assert.rejects(player.loadArchive(signal()), /Allow file access/);
  assert.equal(await requestGameSourceAccess(source), "available");
  const [entry] = await player.loadArchive(signal());
  assert.equal(await entry.blob.text(), "123456789");
  file = new File([gameIso({ contents: "987654321" })], file.name, { lastModified: file.lastModified + 1 });
  assert.notDeepEqual(await inspectLocalSourceFiles(source, cache), game.archiveFiles);
});

test("unrecognized ISO titles omit the extension", () => {
  assert.equal(getSourceGamePresentation({ name: "My Adventure.ISO" }, [], []).displayTitle, "My Adventure");
});

test("ISO size limits and cancellation apply before reading disc bytes", async () => {
  validateLocalGameArchive({ name: "game.iso", size: maxLocalGameSize });
  assert.throws(() => validateLocalGameArchive({ name: "game.iso", size: maxLocalGameSize + 1 }), /4096 MiB/);
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(openLocalGameArchive(iso(), controller.signal), { name: "AbortError" });
});

test("unreadable, UDF-only and truncated ISOs produce actionable errors", async () => {
  for (const bytes of [new Uint8Array(32 * 2048), gameIso().subarray(0, 17 * 2048)]) {
    await assert.rejects(scanLocalGameArchive(new File([bytes], "game.iso")), /ISO 9660/);
  }
  await assert.rejects(scanLocalGameArchive(new File([gameIso().subarray(0, 30 * 2048)], "game.iso")), /incomplete/);
});

test("invalid extents, endian mismatches, directory cycles and unsupported record layouts are rejected", async () => {
  const mutations = [
    (bytes) => bothEndian(bytes, 22 * 2048 + 2, 999),
    (bytes) => { bytes[22 * 2048 + 6] = 1; },
    (bytes) => { bytes[22 * 2048 + 25] = 0x80; },
    (bytes) => { bytes[22 * 2048 + 26] = 1; },
    (bytes) => { bothEndian(bytes, 20 * 2048 + 68 + 2, 20); bothEndian(bytes, 20 * 2048 + 68 + 10, 2048); },
    (bytes) => { bytes[22 * 2048] = 33; },
  ];
  for (const mutate of mutations) {
    const bytes = gameIso();
    mutate(bytes);
    await assert.rejects(openLocalGameArchive(new File([bytes], "bad.iso"), signal()), /ISO/);
  }
});

test("ISO traversal paths, duplicate names and empty discs are rejected", async () => {
  for (const filename of ["../BAD;1", "BAD/FILE;1", "BAD\\FILE;1", "__proto__", ".;1"]) {
    await assert.rejects(scanLocalGameArchive(iso({ filename })), /invalid/);
  }
  const bytes = gameIso();
  const duplicate = isoRecord("vol.cat;2", 30, 9);
  bytes.set(duplicate, 22 * 2048 + bytes[22 * 2048]);
  await assert.rejects(scanLocalGameArchive(new File([bytes], "bad.iso")), /duplicate/);
  bytes.fill(0, 22 * 2048, 23 * 2048);
  await assert.rejects(scanLocalGameArchive(new File([bytes], "empty.iso")), /does not contain/);
});
