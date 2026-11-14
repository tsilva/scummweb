import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { compatibilityStatusLabels, filterCompatibilityEntries, getCompatibilitySummary } from "../lib/game-compatibility.mjs";
import { renderCompatibilityDocs } from "../scripts/generate-compatibility-docs.mjs";

const data = JSON.parse(await readFile(new URL("../data/game-compatibility.json", import.meta.url), "utf8"));

test("compatibility records retain edition-specific evidence with distinct upstream ratings", () => {
  assert.equal(data.schemaVersion, 4);
  assert.match(data.recordedOn, /^\d{4}-\d{2}-\d{2}$/);
  const summary = getCompatibilitySummary(data.entries);
  assert.equal(summary.total, summary.checked + summary.untested);
  assert.equal(summary.checked, summary.verified + summary.warnings + summary.failed);
  assert.ok(summary.checkedGames >= 154);
  assert.ok(summary.checked >= 167);
  const ids = new Set();
  const checkedGameIds = new Set(data.entries.filter((entry) => entry.status !== "not-tested").map((entry) => entry.gameId));
  for (const entry of data.entries) {
    assert.ok(entry.title);
    assert.ok(!entry.title.includes("(Demo) (Demo)"));
    assert.match(entry.gameId, /^[a-z0-9_-]+:[a-z0-9_-]+$/);
    const key = `${entry.gameId}:${entry.edition ?? ""}`;
    assert.ok(!ids.has(key), `Duplicate entry: ${key}`);
    ids.add(key);
    assert.ok(Object.hasOwn(compatibilityStatusLabels, entry.status));
    for (const check of [entry, ...(entry.history ?? [])]) {
      if (["startup-warning", "startup-failed"].includes(check.status)) {
        assert.ok(["scummvm", "scummweb"].includes(check.issueScope), `${key}: runtime issue scope required`);
      } else {
        assert.equal(check.issueScope, undefined);
      }
    }
    if (entry.status !== "not-tested") {
      assert.ok(entry.edition && entry.observation);
      assert.equal(entry.upstreamRating, undefined);
      if (entry.history) {
        assert.ok(entry.history.length > 0);
        for (const check of entry.history) {
          assert.match(check.recordedOn, /^\d{4}-\d{2}-\d{2}$/);
          assert.ok(Object.hasOwn(compatibilityStatusLabels, check.status));
          assert.notEqual(check.status, "not-tested");
          assert.ok(check.observation);
        }
        assert.equal(entry.history.at(-1).status, entry.status);
        assert.equal(entry.history.at(-1).observation, entry.observation);
      }
    } else {
      assert.equal(entry.status, "not-tested");
      assert.ok(!checkedGameIds.has(entry.gameId), `${entry.gameId} already has a checked edition`);
      assert.equal(entry.edition, undefined);
      assert.ok(["Excellent", "Good", "Bugged"].includes(entry.upstreamRating));
    }
  }
});

test("runtime warning and failure results are counted and searchable separately from untested games", () => {
  const entries = [
    { title: "Same game", gameId: "test:game", edition: "DOS.zip", status: "startup-verified", observation: "Menu rendered." },
    { title: "Same game", gameId: "test:game", edition: "Amiga.zip", status: "startup-failed", issueScope: "scummweb", observation: "Engine aborts with valid resources." },
    { title: "Music", gameId: "test:music", edition: "CD.zip", status: "startup-warning", issueScope: "scummvm", observation: "Audio codec unsupported by the engine." },
    { title: "Other", gameId: "test:other", status: "not-tested", upstreamRating: "Good" },
  ];
  assert.deepEqual(getCompatibilitySummary(entries), {
    total: 4, verified: 1, verifiedGames: 1, warnings: 1, failed: 1,
    checked: 3, checkedGames: 2, untested: 1,
  });
  assert.deepEqual(filterCompatibilityEntries(entries, { query: "resource", status: "startup-failed" }), [entries[1]]);
  assert.deepEqual(filterCompatibilityEntries(entries, { query: "audio", status: "startup-warning" }), [entries[2]]);
  const markdown = renderCompatibilityDocs({ ...data, entries });
  assert.match(markdown, /checked 3 editions across\s+2 games/);
  assert.match(markdown, /\| With warnings \| 1 \|/);
  assert.match(markdown, /\| Failed \| 1 \|/);
  assert.match(markdown, /1 games? without a recorded check/);
});

test("public results exclude copy-specific faults while retaining observed startup evidence", () => {
  for (const gameId of ["toltecs:toltecs", "saga:ihnm", "saga:ite", "cine:fw"]) {
    const entry = data.entries.find((candidate) => candidate.gameId === gameId);
    assert.equal(entry.status, "startup-verified");
    assert.doesNotMatch(JSON.stringify(entry), /missing|SAMPLE\.(AD|OPL)|INSTR\.(AD|OPL)|archive lacks/i);
  }
  const loom = data.entries.filter((entry) => entry.gameId === "scumm:loom");
  assert.ok(loom.some((entry) => entry.status === "startup-verified"));
  assert.ok(!loom.some((entry) => entry.edition === "Loom (Amiga).zip"));
  assert.doesNotMatch(JSON.stringify(data.entries), /English resource index|Spanish resources|SAMPLE\.(AD|OPL)|INSTR\.(AD|OPL)|archive lacks/i);
});

test("normal original game prompts do not create compatibility warnings", () => {
  const prompts = data.entries.filter((entry) => /^Original .*reached; gameplay beyond it was not verified\./.test(entry.observation ?? ""));
  assert.equal(prompts.length, 5);
  assert.ok(prompts.every((entry) => entry.status === "startup-verified"));
  assert.ok(prompts.every((entry) => /gameplay beyond it was not verified/.test(entry.observation)));
  assert.deepEqual(filterCompatibilityEntries(data.entries, { status: "startup-warning" }).map((entry) => entry.gameId).sort(), [
    "ags:primordia",
    "ags:technobabylon",
    "grim:monkey4",
    "mads:nebular",
    "mohawk:arthurbday",
    "mohawk:arthurcomp",
    "mohawk:arthurrace",
    "mohawk:catinthehat",
    "parallaction:bra",
    "sword1:sword1",
    "zvision:zgi",
  ]);
});

test("the compatibility summary counts the current result without duplicating check history", () => {
  const entry = {
    title: "Repaired", gameId: "test:fixed", edition: "DOS.zip", status: "startup-verified", observation: "First scene rendered.",
    history: [
      { recordedOn: "2026-11-03", status: "startup-failed", issueScope: "scummweb", observation: "Engine aborted with valid game data." },
      { recordedOn: "2026-11-04", status: "startup-verified", observation: "First scene rendered." },
    ],
  };
  const markdown = renderCompatibilityDocs({ ...data, entries: [entry] });
  assert.match(markdown, /\| Verified \| 1 \|/);
  assert.match(markdown, /\| Failed \| 0 \|/);
  assert.doesNotMatch(markdown, /First scene rendered|Engine aborted with valid game data/);
});

test("search handles title accents, engine IDs, edition names, and combined status filters", () => {
  const search = (query, status = "all") => filterCompatibilityEntries(data.entries, { query, status });
  assert.ok(search("DRASCULA").some((game) => game.title.startsWith("Dráscula")));
  assert.deepEqual(search("sky:sky").map((game) => game.title), ["Beneath a Steel Sky"]);
  assert.ok(search("Beneath CD VGA").some((game) => game.title === "Beneath a Steel Sky"));
  assert.equal(search("sky:sky", "not-tested").length, 0);
  assert.ok(search("grim", "startup-verified").some((game) => game.title === "Grim Fandango (Demo)"));
  assert.equal(search("no-such-game-12345").length, 0);
  assert.equal(search("   ").length, data.entries.length);
  assert.equal(filterCompatibilityEntries(data.entries, { status: "startup-verified" }).length, getCompatibilitySummary(data.entries).verified);
});

test("editions are independent entries and edition searches return only the matching variant", () => {
  const cruise = filterCompatibilityEntries(data.entries, { query: "cruise:cruise" });
  assert.equal(cruise.length, 2);
  assert.deepEqual(cruise.map((entry) => entry.edition), [
    "Cruise for a Corpse (Atari ST).zip",
    "Cruise for a Corpse (VGA DOS).zip",
  ]);
  const atari = filterCompatibilityEntries(data.entries, { query: "cruise Atari" });
  assert.equal(atari.length, 1);
  assert.equal(atari[0].edition, cruise[0].edition);
  const police = filterCompatibilityEntries(data.entries, { query: "agi:pq1" });
  assert.equal(police.length, 1);
  assert.equal(police[0].gameId, "agi:pq1");
});

test("published compatibility documentation is generated from the canonical list", async () => {
  const markdown = await readFile(new URL("../docs/game-testing.md", import.meta.url), "utf8");
  assert.equal(markdown, renderCompatibilityDocs(data));
});
