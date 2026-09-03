import { test } from "node:test";
import assert from "node:assert/strict";
import { columnsThatFit, evenGap, splitIntoBoards, CASE_WIDTH, MIN_GAP } from "./boards.ts";

// Run with `npm test`. The arithmetic is small; what it pins down is the edges
// that produce visible bugs: a row of exactly n cases must not spill to n-1
// over a trailing gap that is not there, and the spacing must come out equal at
// the ends and between, because that is the whole point of deriving it.

test("a row fits the cases it has room for, counting gaps between them only", () => {
  // Exactly three cases and the two gaps between them.
  const exact = CASE_WIDTH * 3 + MIN_GAP * 2;
  assert.equal(columnsThatFit({ available: exact }), 3);
  // One pixel short of the third case.
  assert.equal(columnsThatFit({ available: exact - 1 }), 2);
  // One pixel short of a fourth, which would also need a fourth gap.
  assert.equal(columnsThatFit({ available: exact + MIN_GAP + CASE_WIDTH - 1 }), 3);
});

test("a viewport too narrow for one case still renders one", () => {
  assert.equal(columnsThatFit({ available: 40 }), 1);
  assert.equal(columnsThatFit({ available: 0 }), 1);
  assert.equal(columnsThatFit({ available: Number.NaN }), 1);
});

test("the gap divides the leftover space equally, ends included", () => {
  // Room for three covers and 40px spare: four gaps of 10 -- one at each end,
  // one between each pair -- so a centred row puts 10px against each upright.
  const available = CASE_WIDTH * 3 + 40;
  const gap = evenGap({ available, columns: 3 });
  assert.equal(gap, 10);
  assert.equal(CASE_WIDTH * 3 + gap * 4, available);
});

test("the gap never goes negative when a single cover overflows", () => {
  assert.equal(evenGap({ available: 40, columns: 1 }), 0);
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
