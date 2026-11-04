import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { filterCompatibilityEntries, getCompatibilitySummary } from "../lib/game-compatibility.mjs";
import { renderCompatibilityDocs } from "../scripts/generate-compatibility-docs.mjs";

const data = JSON.parse(await readFile(new URL("../data/game-compatibility.json", import.meta.url), "utf8"));

test("compatibility records retain edition-specific evidence with distinct upstream ratings", () => {
  assert.equal(data.schemaVersion, 2);
  assert.match(data.recordedOn, /^\d{4}-\d{2}-\d{2}$/);
  const summary = getCompatibilitySummary(data.entries);
  assert.equal(summary.total, summary.verified + summary.untested);
  assert.ok(summary.verifiedGames >= 154);
  assert.ok(summary.verified >= 168);
  const ids = new Set();
  for (const entry of data.entries) {
    assert.ok(entry.title);
    assert.ok(!entry.title.includes("(Demo) (Demo)"));
    assert.match(entry.gameId, /^[a-z0-9_-]+:[a-z0-9_-]+$/);
    const key = `${entry.gameId}:${entry.edition ?? ""}`;
    assert.ok(!ids.has(key), `Duplicate entry: ${key}`);
    ids.add(key);
    if (entry.status === "startup-verified") {
      assert.ok(entry.edition && entry.observation);
      assert.equal(entry.upstreamRating, undefined);
    } else {
      assert.equal(entry.status, "not-tested");
      assert.equal(entry.edition, undefined);
      assert.ok(["Excellent", "Good", "Bugged"].includes(entry.upstreamRating));
    }
  }
});

test("search handles title accents, engine IDs, edition names, and combined status filters", () => {
  const search = (query, status = "all") => filterCompatibilityEntries(data.entries, { query, status });
  assert.ok(search("DRASCULA").some((game) => game.title.startsWith("Dráscula")));
  assert.deepEqual(search("sky:sky").map((game) => game.title), ["Beneath a Steel Sky"]);
  assert.ok(search("Beneath CD VGA").some((game) => game.title === "Beneath a Steel Sky"));
  assert.equal(search("sky:sky", "not-tested").length, 0);
  assert.ok(search("grim", "not-tested").some((game) => game.title === "Grim Fandango"));
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
