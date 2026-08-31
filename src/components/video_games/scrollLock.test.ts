import { test } from "node:test";
import assert from "node:assert/strict";
import { handlesOwnScroll, type ScrollBox } from "./scrollLock.ts";

// Run with `npm test`. No browser: the decision is fed a chain of plain objects
// standing in for the elements between a touch target and the body, outermost
// last.
//
// What it is pinning down: with a dialog open, a finger anywhere on the page
// must be cancelled, and a finger inside the dialog's own scrolling region must
// not be. Getting the second half wrong locks the card's content in place,
// which is worse than the bug.

/** A box that cannot scroll: the default for everything that is not a scroller. */
function plain(overflowY = "visible"): ScrollBox {
  return { overflowY, scrollHeight: 400, clientHeight: 400 };
}

/** A scroller with `over` px of content past its bottom edge. */
function scroller(over: number, overflowY = "auto"): ScrollBox {
  return { overflowY, scrollHeight: 400 + over, clientHeight: 400 };
}

test("a touch on the page behind the dialog is not the dialog's", () => {
  assert.equal(handlesOwnScroll([plain(), plain(), plain()]), false);
});

test("a touch with no element under it at all is not the dialog's", () => {
  assert.equal(handlesOwnScroll([]), false);
});

test("a touch inside a scrolling region is the dialog's", () => {
  assert.equal(handlesOwnScroll([plain(), scroller(200), plain()]), true);
});

test("scroll and auto both count, hidden and clip do not", () => {
  assert.equal(handlesOwnScroll([scroller(200, "scroll")]), true);
  assert.equal(handlesOwnScroll([scroller(200, "hidden")]), false);
  assert.equal(handlesOwnScroll([scroller(200, "clip")]), false);
});

test("a scroller with nothing to scroll hands the gesture to the page", () => {
  // The card's region is `overflow-y: auto` whether or not its content
  // overflows, and a short card must not eat the gesture and leave the finger
  // doing nothing.
  assert.equal(handlesOwnScroll([plain(), scroller(0)]), false);
});
