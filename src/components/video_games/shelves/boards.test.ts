import { test } from "node:test";
import assert from "node:assert/strict";
import { columnsThatFit, splitIntoBoards, CASE_WIDTH } from "./boards.ts";

// Run with `npm test`. The arithmetic is small; what these pin down is the
// two edges that produced visible bugs in the mock: a row of exactly n cases
// must not spill to n-1 because of the trailing gap that is not there, and a
// full last row must not lean, because leaning is what says "this row ran out".

test("a row fits the cases it has room for, counting gaps between them only", () => {
  const gap = 3;
  // Exactly three cases and the two gaps between them.
  const exact = CASE_WIDTH * 3 + gap * 2;
  assert.equal(columnsThatFit({ available: exact, gap }), 3);
  // One pixel short of the third case.
  assert.equal(columnsThatFit({ available: exact - 1, gap }), 2);
  // One pixel short of a fourth, which would also need a fourth gap.
  assert.equal(columnsThatFit({ available: exact + gap + CASE_WIDTH - 1, gap }), 3);
});

test("a viewport too narrow for one case still renders one", () => {
  assert.equal(columnsThatFit({ available: 40, gap: 3 }), 1);
  assert.equal(columnsThatFit({ available: 0, gap: 3 }), 1);
  assert.equal(columnsThatFit({ available: Number.NaN, gap: 3 }), 1);
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

test("a full last row does not lean, a short one does", () => {
  assert.deepEqual(
    splitIntoBoards([1, 2, 3, 4], 2).map((b) => b.isShort),
    [false, false]
  );
  assert.deepEqual(
    splitIntoBoards([1, 2, 3], 2).map((b) => b.isShort),
    [false, true]
  );
});

test("an empty group still gets a shelf to be empty on", () => {
  const boards = splitIntoBoards([], 5);
  assert.equal(boards.length, 1);
  assert.deepEqual(boards[0].games, []);
});
