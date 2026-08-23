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
    wasDescending: true,
  };
}

/** The bar down and the page at rest. Starting from the initial state instead
 *  would measure travel from the top of the page, so the first sample of any
 *  run already exceeds the threshold. */
function shown(scrollY: number): HideOnScrollState {
  return initialHideOnScrollState({ scrollY, viewportHeight: VIEWPORT, now: 0 });
}

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
      { y: 1756, after: 32 },
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
  // One sample late by design: a lone downward sample is not yet a gesture.
  assert.deepEqual(replay([440, 480, 520], shown(400)), [true, false, false]);
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

test("the bar can hide again once the settle window has passed", () => {
  // The settle window is a delay, not a lock: reverse into a real scroll down
  // and the bar still goes away.
  const visible = replay([1900, { y: 1940, after: 600 }, { y: 1980 }, { y: 2020 }], hidden(2000));
  assert.deepEqual(visible, [true, true, false, false]);
});

test("the chrome budget is spent, not permanent", () => {
  // 56px of resize buys exactly 56px of grace: the first 40 of the scroll down
  // is absorbed, the rest is the finger and the bar goes away.
  const visible = replay(
    [{ y: 1000, h: VIEWPORT - 56 }, { y: 1040 }, { y: 1080 }, { y: 1120 }],
    shown(1000)
  );
  assert.deepEqual(visible, [true, true, false, false]);
});

test("the same scroll down with no resize hides a sample sooner", () => {
  // The contrast case for the one above: without a budget to spend, the second
  // downward sample is enough.
  assert.deepEqual(replay([1040, 1080, 1120], shown(1000)), [true, false, false]);
});

test("a resize on its own decides nothing", () => {
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

test("the first hide of a session is not blocked by the settle window", () => {
  // initialHideOnScrollState must not claim the bar just arrived: it was never
  // away, so a scroll down at t=32 has to work.
  assert.deepEqual(replay([440, 480], shown(400)), [true, false]);
});
