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

/** One replayed sample: a scrollY, optionally with the viewport height at that
 *  moment. Time is deliberately absent: the decision does not look at it. */
type Sample = number | { y: number; h?: number };

/** Replay a run of samples and report what the bar did at each one.
 *
 *  The viewport height carries forward until a sample changes it: a toolbar
 *  that slid in stays in, and resetting it every sample would credit the
 *  chrome budget twice for one resize. */
function replay(samples: Sample[], from: HideOnScrollState): boolean[] {
  let state = from;
  let height = from.lastViewportHeight;
  return samples.map((sample) => {
    const { y, h } = typeof sample === "number" ? { y: sample } : sample;
    height = h ?? height;
    state = nextHideOnScrollState(state, { scrollY: y, viewportHeight: height }, STICKY_AT);
    return state.visible;
  });
}

/** The bar hidden and the page deep in the shelves, which is where every
 *  scroll-up case starts. */
function hidden(scrollY: number): HideOnScrollState {
  return {
    ...initialHideOnScrollState({ scrollY, viewportHeight: VIEWPORT }),
    visible: false,
    wasDescending: true,
  };
}

/** The bar down and the page at rest. Starting from the initial state instead
 *  would measure travel from the top of the page, so the first sample of any
 *  run already exceeds the threshold. */
function shown(scrollY: number): HideOnScrollState {
  return initialHideOnScrollState({ scrollY, viewportHeight: VIEWPORT });
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

test("a viewport growing back does not show or discount anything", () => {
  // Scrolling down gives the toolbar's space back. That must not read as the
  // toolbar arriving, and it must not buy any grace either.
  const visible = replay([{ y: 1040, h: VIEWPORT + 56 }, { y: 1080 }], shown(1000));
  assert.deepEqual(visible, [true, false]);
});

test("a toolbar move discounts pixels even when the bar was already down", () => {
  // The budget is credited by the browser's chrome moving, not by the bar
  // changing state: the compensating scroll arrives either way, and a visible
  // bar is just as capable of being hidden by it.
  const visible = replay([{ y: 1000, h: VIEWPORT - 56 }, { y: 1040 }, { y: 1080 }], shown(1000));
  assert.deepEqual(visible, [true, true, false]);
});

test("the toolbar leaving forgives the budget rather than charging for it", () => {
  // The regression a timer caused: after any upward scroll, reversing had to
  // wait the hold out. A scroll down makes the toolbar leave, and that is
  // exactly when hiding must be immediate.
  const visible = replay(
    [{ y: 1000, h: VIEWPORT - 56 }, { y: 1040, h: VIEWPORT }, { y: 1080 }],
    shown(1000)
  );
  assert.deepEqual(visible, [true, true, false]);
});

test("with no toolbar to read, the scroll rule still brings the bar back", () => {
  // A standalone window, or a toolbar already fully out: the height never
  // moves, so showing falls back to 10px of upward scroll.
  assert.deepEqual(replay([1994, 1988, 1982], hidden(2000)), [false, true, true]);
});

// --- the reported bug -------------------------------------------------------

test("a toolbar jump mid-fling does not hide the bar again", () => {
  // Flick up hard from 2000. The bar shows on the first upward sample, then the
  // browser reports +56 against the finger before the fling resumes. No resize
  // is reported alongside it, so the two-sample rule is all that catches it.
  assert.deepEqual(replay([1900, 1956, 1800, 1700], hidden(2000)), [true, true, true, true]);
});

test("the same jump with its resize reported is caught by the budget too", () => {
  const visible = replay([1900, { y: 1956, h: VIEWPORT - 56 }, 1800], hidden(2000));
  assert.deepEqual(visible, [true, true, true]);
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
  // One sample late by design, which is one frame.
  assert.deepEqual(replay([440, 480, 520], shown(400)), [true, false, false]);
});

test("a scroll down needs no extra travel when no toolbar has moved", () => {
  // The latency budget for hiding, stated as a test: 10px plus one frame, and
  // nothing else. A timer used to add half a second here.
  assert.deepEqual(replay([1012, 1024], shown(1000)), [true, false]);
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
