import { test } from "node:test";
import assert from "node:assert/strict";
import {
  initialHideOnScrollState,
  nextHideOnScrollState,
  type HideOnScrollState,
  type ScrollReading,
} from "./hideOnScroll.ts";

// Run with `npm test`. No browser and no dependencies: node --test runs this
// TypeScript directly.
//
// Every case here is a sequence, because no single sample is wrong on its own.
// The bug this suite pins down is a bar that hid itself in the middle of a fast
// scroll UP, and the sample that hid it looked exactly like a scroll down.

const STICKY_AT = 300;
const VIEWPORT = 800;

/** Replay a run of scroll positions and report what the bar did at each one.
 *
 *  A reading is either a bare scrollY or `[scrollY, viewportHeight]`, so a
 *  sample where the browser's own toolbar changed size can be written inline. */
function replay(
  positions: (number | [number, number])[],
  from: HideOnScrollState = initialHideOnScrollState({ scrollY: 0, viewportHeight: VIEWPORT })
): boolean[] {
  let state = from;
  return positions.map((position) => {
    const reading: ScrollReading = Array.isArray(position)
      ? { scrollY: position[0], viewportHeight: position[1] }
      : { scrollY: position, viewportHeight: VIEWPORT };
    state = nextHideOnScrollState(state, reading, STICKY_AT);
    return state.visible;
  });
}

/** The bar hidden and the page deep in the shelves, which is where every
 *  scroll-up case starts. */
function hidden(scrollY: number): HideOnScrollState {
  return {
    visible: false,
    anchor: scrollY,
    lastScrollY: scrollY,
    lastViewportHeight: VIEWPORT,
    wasDescending: true,
  };
}

/** The bar down and the page at rest below the sticky threshold. Starting from
 *  the initial state instead would measure travel from the top of the page, so
 *  the first sample of any run already exceeds the threshold. */
function shown(scrollY: number): HideOnScrollState {
  return { ...initialHideOnScrollState({ scrollY, viewportHeight: VIEWPORT }), visible: true };
}

// --- the reported bug -------------------------------------------------------

test("a toolbar jump mid-fling does not hide the bar again", () => {
  // Flick up hard from 2000. The bar shows on the first real upward sample,
  // then the browser's toolbar slides back in and reports +56 against the
  // finger before the fling continues.
  const visible = replay([1900, 1956, 1800, 1700], hidden(2000));
  assert.deepEqual(visible, [true, true, true, true]);
});

test("the same jump does not hide the bar when it also resizes the viewport", () => {
  // Same sequence, on a browser that shrinks innerHeight as the toolbar
  // arrives. Either guard alone is enough; this asserts the resize one.
  const visible = replay([1900, [1956, VIEWPORT - 56], [1800, VIEWPORT - 56]], hidden(2000));
  assert.deepEqual(visible, [true, true, true]);
});

test("a fling up that stutters twice still leaves the bar down", () => {
  const visible = replay([1900, 1930, 1820, 1850, 1700], hidden(2000));
  assert.deepEqual(visible, [true, true, true, true, true]);
});

// --- what still has to work -------------------------------------------------

test("a sustained scroll down hides the bar", () => {
  // One sample late by design: a lone downward sample is not yet a gesture.
  const visible = replay([440, 480, 520], shown(400));
  assert.deepEqual(visible, [true, false, false]);
});

test("a slow scroll down hides the bar once it passes the threshold", () => {
  // 5px a sample: nothing until the run adds up to more than 10.
  const visible = replay([405, 410, 415, 420], shown(400));
  assert.deepEqual(visible, [true, true, false, false]);
});

test("a deliberate scroll up brings the bar back", () => {
  const visible = replay([1990, 1980, 1970], hidden(2000));
  assert.deepEqual(visible, [false, true, true]);
});

test("scrolling back above the sticky threshold always shows the bar", () => {
  const visible = replay([290, 250], hidden(2000));
  assert.deepEqual(visible, [true, true]);
});

test("a resize on its own decides nothing", () => {
  // The keyboard opening, or a toolbar settling while the page is still.
  const visible = replay(
    [
      [500, 600],
      [500, 800],
    ],
    hidden(500)
  );
  assert.deepEqual(visible, [false, false]);
});

test("a resize does not block a hide once the descent resumes", () => {
  // Guard two only distrusts the sample that resized, not the ones after it.
  const visible = replay([[1000, 760], 1040, 1080], hidden(1000));
  assert.deepEqual(visible, [false, false, false]);
});

test("hiding survives a genuine reversal followed by a real descent", () => {
  const visible = replay([1900, 1940, 1980, 2020], hidden(2000));
  assert.deepEqual(visible, [true, true, false, false]);
});

test("a repeated sample changes nothing", () => {
  const visible = replay([2000, 2000], hidden(2000));
  assert.deepEqual(visible, [false, false]);
});
