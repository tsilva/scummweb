import assert from "node:assert/strict";
import test from "node:test";
import { directionalNeighbor } from "../app/home-shell/directional-neighbor.mjs";

const card = (left, top) => ({ left, top, right: left + 100, bottom: top + 150 });

test("horizontal navigation stays on the current row and stops at its ends", () => {
  const cards = [card(0, 0), card(110, 0), card(0, 160), card(110, 160)];
  assert.equal(directionalNeighbor(cards[0], cards, "ArrowRight"), 1);
  assert.equal(directionalNeighbor(cards[1], cards, "ArrowLeft"), 0);
  assert.equal(directionalNeighbor(cards[2], cards, "ArrowLeft"), -1);
  assert.equal(directionalNeighbor(cards[1], cards, "ArrowRight"), -1);
});

test("vertical navigation follows the same column and can reach a shorter row", () => {
  const cards = [card(0, 0), card(110, 0), card(0, 160), card(110, 160), card(0, 320)];
  assert.equal(directionalNeighbor(cards[1], cards, "ArrowDown"), 3);
  assert.equal(directionalNeighbor(cards[3], cards, "ArrowUp"), 1);
  assert.equal(directionalNeighbor(cards[3], cards, "ArrowDown"), 4);
  assert.equal(directionalNeighbor(card(110, -2), cards, "ArrowDown"), 3,
    "raising the focused card must not make its neighbor look like the next row");
});
