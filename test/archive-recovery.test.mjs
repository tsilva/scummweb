import assert from "node:assert/strict";
import test from "node:test";
import { startArchiveRecovery } from "../app/home-shell/archive-recovery.mjs";

function recoveryFixture(t, { sources, checkSource }) {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const document = Object.assign(new EventTarget(), { hidden: false });
  const recovery = startArchiveRecovery({
    document, getSources: () => sources, checkSource, isBusy: () => false,
  });
  t.after(() => recovery.stop());

  return {
    ...recovery,
    setHidden(hidden) {
      document.hidden = hidden;
      document.dispatchEvent(new Event("visibilitychange"));
    },
    async wait(ms) {
      t.mock.timers.tick(ms);
      await new Promise(setImmediate);
    },
  };
}

test("offline recovery rotates one file per retry and caps its backoff at 30 seconds", async (t) => {
  const sources = Array.from({ length: 100 }, (_, index) => `game-${index}.zip`);
  const reads = [];
  const recovery = recoveryFixture(t, {
    sources, checkSource: async (source) => { reads.push(source); return "missing"; },
  });

  for (const [index, delay] of [3_000, 6_000, 12_000, 24_000, 30_000, 30_000].entries()) {
    await recovery.wait(delay - 1);
    assert.equal(reads.length, index);
    await recovery.wait(1);
    assert.deepEqual(reads, sources.slice(0, index + 1));
  }
});

test("a successful probe checks the other archives once, without parallel archive scans", async (t) => {
  const sources = ["first.zip", "second.zip", "third.iso"].map((id) => ({ id, archiveFolderId: "folder" }));
  const reads = [];
  const slow = Promise.withResolvers();
  const recovery = recoveryFixture(t, {
    sources,
    async checkSource(source) {
      reads.push(source.id);
      if (source.id === "second.zip") return "available";
      if (reads.length === 3) await slow.promise;
      return "missing";
    },
  });

  await recovery.wait(3_000);
  assert.deepEqual(reads, ["first.zip"]);
  await recovery.wait(6_000);
  await recovery.wait(30_000);
  assert.deepEqual(reads, ["first.zip", "second.zip", "first.zip"]);
  slow.resolve();
  await recovery.wait(0);
  assert.deepEqual(reads, ["first.zip", "second.zip", "first.zip", "third.iso"]);
});

test("recovery rotates between folders and only sweeps the folder with a successful probe", async (t) => {
  const sources = [
    { id: "a1.zip", archiveFolderId: "folder-a" },
    { id: "a2.zip", archiveFolderId: "folder-a" },
    { id: "a3.zip", archiveFolderId: "folder-a" },
    { id: "b1.zip", archiveFolderId: "folder-b" },
    { id: "b2.zip", archiveFolderId: "folder-b" },
    { id: "ungrouped.zip" },
  ];
  const reads = [];
  const recovery = recoveryFixture(t, {
    sources,
    async checkSource(source) {
      reads.push(source.id);
      return source.id === "a2.zip" ? "available" : "missing";
    },
  });

  await recovery.wait(3_000);
  await recovery.wait(6_000);
  await recovery.wait(12_000);
  assert.deepEqual(reads, ["a1.zip", "b1.zip", "ungrouped.zip"]);
  await recovery.wait(24_000);
  assert.deepEqual(reads, ["a1.zip", "b1.zip", "ungrouped.zip", "a2.zip", "a1.zip", "a3.zip"]);
  await recovery.wait(3_000);
  assert.equal(reads.at(-1), "b2.zip");
});

test("recovery pauses while hidden and a manually recovered archive can start the sweep", async (t) => {
  const sources = [{ id: "first.zip" }, { id: "second.iso" }, { id: "third.zip", archiveFolderId: "other" }];
  const reads = [];
  const recovery = recoveryFixture(t, {
    sources,
    checkSource: async (source) => { reads.push(source.id); return "missing"; },
  });

  recovery.setHidden(true);
  await recovery.wait(120_000);
  assert.deepEqual(reads, []);

  recovery.setHidden(false);
  recovery.archiveAvailable(sources[0]);
  assert.deepEqual(reads, ["second.iso"]);
  recovery.stop();
  await recovery.wait(120_000);
  assert.deepEqual(reads, ["second.iso"]);
});
