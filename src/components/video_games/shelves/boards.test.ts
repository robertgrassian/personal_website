import { test } from "node:test";
import assert from "node:assert/strict";
import { columnsThatFit, splitIntoBoards, CASE_WIDTH } from "./boards.ts";

// Run with `npm test`. The arithmetic is small; what it pins down is the edge
// that produces a visible bug. This count becomes the grid's explicit track
// count, so one too many overflows the shelf rather than wrapping: a row of
// exactly n cases must not read as n + 1 over a trailing gap that is not there,
// and a fractional width must round down.

test("a row fits the cases it has room for, counting gaps between them only", () => {
  const gap = 12;
  // Exactly three cases and the two gaps between them.
  const exact = CASE_WIDTH * 3 + gap * 2;
  assert.equal(columnsThatFit({ available: exact, gap }), 3);
  // One pixel short of the third case.
  assert.equal(columnsThatFit({ available: exact - 1, gap }), 2);
  // One pixel short of a fourth, which would also need a fourth gap.
  assert.equal(columnsThatFit({ available: exact + gap + CASE_WIDTH - 1, gap }), 3);
});

test("a fractional width rounds down, never up into a track that is not there", () => {
  const gap = 12;
  const exact = CASE_WIDTH * 3 + gap * 2;
  assert.equal(columnsThatFit({ available: exact - 0.4, gap }), 2);
  assert.equal(columnsThatFit({ available: exact + 0.4, gap }), 3);
});

test("a viewport too narrow for one case still renders one", () => {
  assert.equal(columnsThatFit({ available: 40, gap: 12 }), 1);
  assert.equal(columnsThatFit({ available: 0, gap: 12 }), 1);
  assert.equal(columnsThatFit({ available: Number.NaN, gap: 12 }), 1);
});

test("games split one row per board", () => {
  const boards = splitIntoBoards([1, 2, 3, 4, 5, 6, 7], 3);
  assert.deepEqual(
    boards.map((b) => b.games),
    [[1, 2, 3], [4, 5, 6], [7]]
  );
});

test("only the first board carries the group name", () => {
  const boards = splitIntoBoards([1, 2, 3, 4], 2);
  assert.deepEqual(
    boards.map((b) => b.isFirst),
    [true, false]
  );
});

test("an empty group still gets a shelf to be empty on", () => {
  const boards = splitIntoBoards([], 5);
  assert.equal(boards.length, 1);
  assert.deepEqual(boards[0].games, []);
});
