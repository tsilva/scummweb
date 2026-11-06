import assert from "node:assert/strict";
import test from "node:test";
import { compareGameTitles } from "../lib/game-title-sort.mjs";

test("Roman, Arabic, and fractional installment numbers share natural order", () => {
  const titles = ["Adventure X", "Adventure IV", "Adventure 2.5", "Adventure IX", "Adventure I", "Adventure 3", "Adventure II"];
  assert.deepEqual(titles.sort(compareGameTitles), [
    "Adventure I", "Adventure II", "Adventure 2.5", "Adventure 3", "Adventure IV", "Adventure IX", "Adventure X",
  ]);
  assert.equal(compareGameTitles("Adventure IV.5: Home", "Adventure 4.5: Home"), 0);
  assert.equal(compareGameTitles("Adventure III - Finale", "Adventure 3 - Finale"), 0);
  assert.equal(compareGameTitles("Adventure II (Demo)", "Adventure 2 (Demo)"), 0);
});

test("sort aliases group irregular titles, first games, and demos with sequels", () => {
  const titles = ["The Curse of Monkey Island", "Monkey Island 2: LeChuck's Revenge", "The Secret of Monkey Island (Demo)", "The Secret of Monkey Island"];
  assert.deepEqual(titles.sort(compareGameTitles), [
    "The Secret of Monkey Island", "The Secret of Monkey Island (Demo)",
    "Monkey Island 2: LeChuck's Revenge", "The Curse of Monkey Island",
  ]);
});

test("ordinary titles, initial Roman-looking words, and pronouns remain alphabetical", () => {
  assert.ok(compareGameTitles("Alpha", "beta") < 0);
  assert.ok(compareGameTitles("Adventure 2", "Adventure 10") < 0);
  assert.ok(compareGameTitles("I Have No Mouth, and I Must Scream", "Indiana Jones") < 0);
  assert.ok(compareGameTitles("Mystery", "MIX") > 0);
  assert.ok(compareGameTitles("Chapter IIII", "Chapter IV") > 0, "invalid Roman numerals stay text");
});
