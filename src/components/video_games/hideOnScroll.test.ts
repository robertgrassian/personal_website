import { test } from "node:test";
import assert from "node:assert/strict";
import {
  initialHideOnScrollState,
  nextHideOnScrollState,
  type HideOnScrollState,
} from "./hideOnScroll.ts";

// Run with `npm test`. No browser and no dependencies: node --test runs this
// TypeScript directly.
//
// Every case is a sequence, because no single sample is wrong on its own. The
// bug being pinned down is a bar that hid itself in the middle of a fast scroll
// UP, and the sample that hid it was indistinguishable from a scroll down.

const STICKY_AT = 300;
const VIEWPORT = 800;
const FRAME = 16;

/** One replayed sample: a scrollY, optionally with the viewport height at that
 *  moment and how long after the previous sample it arrived. */
type Sample = number | { y: number; h?: number; after?: number };

/** Replay a run of samples and report what the bar did at each one.
 *
 *  The viewport height carries forward until a sample changes it: a toolbar
 *  that slid in stays in, and resetting it every sample would credit the
 *  chrome budget twice for one resize. */
function replay(samples: Sample[], from: HideOnScrollState): boolean[] {
  let state = from;
  let now = 0;
  let height = from.lastViewportHeight;
  return samples.map((sample) => {
    const { y, h, after = FRAME } = typeof sample === "number" ? { y: sample } : sample;
    now += after;
    height = h ?? height;
    state = nextHideOnScrollState(state, { scrollY: y, viewportHeight: height, now }, STICKY_AT);
    return state.visible;
  });
}

/** The bar hidden and the page deep in the shelves, which is where every
 *  scroll-up case starts. */
function hidden(scrollY: number): HideOnScrollState {
  return {
    ...initialHideOnScrollState({ scrollY, viewportHeight: VIEWPORT, now: 0 }),
    visible: false,
  };
}

/** The bar down and the page at rest. Starting from the initial state instead
 *  would measure travel from the top of the page, so the first sample of any
 *  run already exceeds the threshold. */
function shown(scrollY: number): HideOnScrollState {
  return initialHideOnScrollState({ scrollY, viewportHeight: VIEWPORT, now: 0 });
}

// --- coming back with the browser's toolbar ---------------------------------

test("the bar arrives the moment the toolbar starts taking space", () => {
  // 4px of upward scroll, nowhere near the 10px the scroll rule wants, but the
  // viewport shrank so the toolbar is on its way in and the bar goes with it.
  assert.deepEqual(replay([{ y: 1996, h: VIEWPORT - 8 }], hidden(2000)), [true]);
});

test("a toolbar revealing over several samples does not starve the show", () => {
  // The regression this replaced: resetting the anchor on every resize meant
  // upward travel never accumulated, and a toolbar that slides in gradually
  // changes the height on nearly every sample of the gesture.
  const visible = replay(
    [
      { y: 1996, h: VIEWPORT - 8 },
      { y: 1992, h: VIEWPORT - 16 },
      { y: 1988, h: VIEWPORT - 24 },
    ],
    hidden(2000)
  );
  assert.deepEqual(visible, [true, true, true]);
});

test("a viewport growing back does not show or hold the bar", () => {
  // Scrolling down gives the toolbar's space back. That must not read as the
  // toolbar arriving, and it must not arm the hold either.
  const visible = replay([{ y: 1040, h: VIEWPORT + 56 }, { y: 1080 }], shown(1000));
  assert.deepEqual(visible, [false, false]);
});

test("a toolbar move holds the bar even when it was already down", () => {
  // The hold is armed by the browser's chrome moving, not by the bar changing
  // state: the compensating scroll arrives either way, and a visible bar is
  // just as capable of being hidden by it.
  const visible = replay([{ y: 1000, h: VIEWPORT - 56 }, { y: 1040 }, { y: 1080 }], shown(1000));
  assert.deepEqual(visible, [true, true, true]);
});

test("with no toolbar to read, the scroll rule still brings the bar back", () => {
  // A standalone window, or a toolbar already fully out: the height never
  // moves, so showing falls back to 10px of upward scroll.
  assert.deepEqual(replay([1994, 1988, 1982], hidden(2000)), [false, true, true]);
});

// --- the reported bug -------------------------------------------------------

test("a toolbar jump mid-fling does not hide the bar again", () => {
  // Flick up hard from 2000. The bar shows on the first real upward sample,
  // then the browser reports +56 against the finger before the fling resumes.
  assert.deepEqual(replay([1900, 1956, 1800, 1700], hidden(2000)), [true, true, true, true]);
});

test("a toolbar settling LATE does not hide the bar", () => {
  // The sequence the two-sample guard alone missed: the fling is over, and
  // several hundred ms later the toolbar finishes animating and the browser
  // pays for it with a run of downward samples that look exactly like a scroll.
  const visible = replay(
    [
      1900,
      1700,
      { y: 1728, h: VIEWPORT - 56, after: 400 },
      { y: 1756, after: 32 },
      { y: 1784, after: 32 },
    ],
    hidden(2000)
  );
  assert.deepEqual(visible, [true, true, true, true, true]);
});

test("a late compensation with no resize reported is still held off", () => {
  // Nothing identifies these pixels as the browser's, so only the settle window
  // after the bar arrived stands between them and a hide.
  const visible = replay(
    [1900, 1700, { y: 1730, after: 200 }, { y: 1760, after: 32 }],
    hidden(2000)
  );
  assert.deepEqual(visible, [true, true, true, true]);
});

test("a fling up that stutters twice still leaves the bar down", () => {
  assert.deepEqual(replay([1900, 1930, 1820, 1850, 1700], hidden(2000)), [
    true,
    true,
    true,
    true,
    true,
  ]);
});

// --- what still has to work -------------------------------------------------

test("a sustained scroll down hides the bar", () => {
  assert.deepEqual(replay([440, 480], shown(400)), [false, false]);
});

test("a slow scroll down hides the bar once it passes the threshold", () => {
  // 5px a sample: nothing until the run adds up to more than 10.
  assert.deepEqual(replay([405, 410, 415, 420], shown(400)), [true, true, false, false]);
});

test("a deliberate scroll up brings the bar back", () => {
  assert.deepEqual(replay([1990, 1980, 1970], hidden(2000)), [false, true, true]);
});

test("scrolling back above the sticky threshold always shows the bar", () => {
  assert.deepEqual(replay([290, 250], hidden(2000)), [true, true]);
});

test("the bar can hide again once the hold has expired", () => {
  // The hold is a delay, not a lock: reverse into a real scroll down after it
  // lapses and the bar still goes away.
  const visible = replay([1900, { y: 1940, after: 600 }, { y: 1980 }], hidden(2000));
  assert.deepEqual(visible, [true, false, false]);
});

test("the hold blocks a hide that arrives too soon after the bar", () => {
  // The contrast case for the one above: same reversal, 200ms earlier.
  const visible = replay([1900, { y: 1940, after: 200 }, { y: 1980 }], hidden(2000));
  assert.deepEqual(visible, [true, true, true]);
});

test("a keyboard-sized resize is not a toolbar", () => {
  // 200px is a software keyboard, not chrome sliding in, and says nothing about
  // which way anyone is scrolling.
  assert.deepEqual(
    replay(
      [
        { y: 500, h: 600 },
        { y: 500, h: 800 },
      ],
      hidden(500)
    ),
    [false, false]
  );
});

test("a repeated sample changes nothing", () => {
  assert.deepEqual(replay([2000, 2000], hidden(2000)), [false, false]);
});

test("the first hide of a session is not blocked by the hold", () => {
  // initialHideOnScrollState must not claim the bar just arrived: it was never
  // away, so a scroll down at t=16 has to work.
  assert.deepEqual(replay([440], shown(400)), [false]);
});
