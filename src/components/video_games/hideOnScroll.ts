// The decision behind the sticky library header's mobile hide-on-scroll,
// with no React in it so `npm test` can replay a phone's scroll sequence
// without a browser or a dependency install. `useHideOnScrollDown.ts` is the
// hook that feeds it real samples.

// Minimum scroll distance (px) before toggling visibility. Filters out
// micro-reversals from slow or momentum scrolling.
const MIN_SCROLL_DELTA = 10;

// Ceiling on the chrome budget below. A single toolbar is well under this; the
// cap only stops a pathological run of resizes banking enough to swallow real
// scrolling.
const MAX_CHROME_DEBT = 200;

// The largest viewport shrink still credible as a browser toolbar. Anything
// bigger is a keyboard or an orientation change, which say nothing about which
// way the user is scrolling.
const MAX_TOOLBAR_HEIGHT = 120;

/** One scroll sample, as the decision below needs to see it. */
export type ScrollReading = {
  scrollY: number;
  /** `window.innerHeight`. Mobile browsers resize it as their own toolbar
   *  slides in and out, and that is the only signal separating a scroll the
   *  finger made from the browser compensating for its own chrome. */
  viewportHeight: number;
};

export type HideOnScrollState = {
  visible: boolean;
  /** Where the current run of travel is measured from: the last toggle or the
   *  last direction reversal, whichever came later. */
  anchor: number;
  lastScrollY: number;
  lastViewportHeight: number;
  /** Did the previous sample also move down? Hiding needs two in a row, which
   *  costs one frame and rules out a lone outlier reported without a resize. */
  wasDescending: boolean;
  /** Pixels of space the browser's chrome has taken and not yet given back.
   *  The browser has to move the page to pay for them, and that movement points
   *  down while the finger is going up, so it must not count as scrolling. */
  chromeDebt: number;
};

export function initialHideOnScrollState(reading: ScrollReading): HideOnScrollState {
  return {
    visible: true,
    anchor: reading.scrollY,
    lastScrollY: reading.scrollY,
    lastViewportHeight: reading.viewportHeight,
    wasDescending: false,
    chromeDebt: 0,
  };
}

/** Pure decision for one scroll sample. Split out of the hook so the sequences
 *  that only happen on a phone can be replayed in a test.
 *
 *  `scrollY` is not monotonic on a phone. A browser toolbar sliding in resizes
 *  the viewport, and the browser moves the document to pay for the space it
 *  took, which arrives as ordinary scroll events pointing against the finger
 *  over the following frames. Read as a scroll down, those hid the bar in the
 *  middle of a fast scroll UP.
 *
 *  Both halves of the answer come from the same observation: the toolbar is
 *  answering the same reach-up gesture this bar is, so a viewport that shrank
 *  is the browser saying "they want the chrome back". Show on it, and discount
 *  exactly as many downward pixels as the space it took. Where the toolbar is
 *  not observable (a standalone window, one already fully out) it also does not
 *  move the document, and the scroll rule below is enough on its own.
 *
 *  The discount is a budget rather than a timer on purpose. A timer bans every
 *  hide for its duration, including the ones a person actually asked for, and
 *  since the toolbar moves on nearly every upward sample it would be re-armed
 *  constantly: reversing into a scroll down then waits it out. A budget is
 *  spent by the very pixels it distrusts, so a real scroll down pays it off and
 *  keeps going.
 *
 *  One thing the budget cannot see is a compensating scroll reported with no
 *  resize alongside it. Two consecutive downward samples are required for that,
 *  which catches a lone outlier and costs one frame. A sustained run of them is
 *  not covered by anything here, deliberately: only a timer could, and a timer
 *  bans real hides for as long as it runs.
 *
 *  Hiding is the only direction that gets discounted. The bar appearing while
 *  someone is already reaching for it costs nothing, so no guard here defends
 *  against a spurious show. */
export function nextHideOnScrollState(
  state: HideOnScrollState,
  reading: ScrollReading,
  stickyThreshold: number
): HideOnScrollState {
  const { scrollY, viewportHeight } = reading;
  // Signed, and the sign is the whole point: a viewport that SHRANK lost the
  // space to a toolbar sliding in, one that grew got it back.
  const heightChange = viewportHeight - state.lastViewportHeight;
  const carried = { ...state, lastScrollY: scrollY, lastViewportHeight: viewportHeight };

  // The toolbar arriving. Come down with it, and bank the space it took.
  if (heightChange < 0 && -heightChange <= MAX_TOOLBAR_HEIGHT) {
    return {
      ...carried,
      visible: true,
      anchor: scrollY,
      wasDescending: false,
      chromeDebt: Math.min(state.chromeDebt - heightChange, MAX_CHROME_DEBT),
    };
  }

  // The toolbar leaving. Only a scroll DOWN makes that happen, so anything
  // still owed now points the same way the finger does and cannot make the
  // decision wrong. Forgive it, rather than making a real scroll down pay it
  // off before the bar will go.
  let chromeDebt = heightChange > 0 ? 0 : state.chromeDebt;

  // Above the point where sticky engages: always show, and keep the anchor
  // current so the delta starts fresh on re-entering the sticky zone.
  if (scrollY < stickyThreshold) {
    return { ...carried, chromeDebt, visible: true, anchor: scrollY, wasDescending: false };
  }

  const step = scrollY - state.lastScrollY;
  if (step === 0) return { ...carried, chromeDebt };

  // A reversal starts a new run, so travel is measured from where the direction
  // changed rather than from before it.
  const run = state.lastScrollY - state.anchor;
  let anchor = run !== 0 && Math.sign(step) !== Math.sign(run) ? state.lastScrollY : state.anchor;

  // Spend the budget before anything counts as the user scrolling down.
  if (step > 0 && chromeDebt > 0) {
    const absorbed = Math.min(chromeDebt, step);
    chromeDebt -= absorbed;
    anchor += absorbed;
  }
  const travelled = scrollY - anchor;
  const descending = step > 0;
  const moved = { ...carried, chromeDebt, wasDescending: descending };

  // Scrolling up means the user is reaching for the controls.
  if (travelled < -MIN_SCROLL_DELTA) {
    return { ...moved, visible: true, anchor: scrollY };
  }
  if (travelled > MIN_SCROLL_DELTA && descending && state.wasDescending) {
    return { ...moved, visible: false, anchor: scrollY };
  }
  return { ...moved, anchor };
}

// --- on-device trace --------------------------------------------------------
//
// Off unless ViewportRecorder turns it on, so this costs one null check per
// scroll event in production. It exists because the only place this bug happens
// is a phone with no console. Delete it once the fix is confirmed on a device.

export type ScrollTraceRow = {
  t: number;
  step: number;
  heightChange: number;
  debt: number;
  visible: boolean;
};

let trace: ScrollTraceRow[] | null = null;

export function enableScrollTrace(): void {
  trace ??= [];
}

export function readScrollTrace(): ScrollTraceRow[] {
  return trace ?? [];
}

export function recordScrollTrace(row: ScrollTraceRow): void {
  if (!trace) return;
  trace.push(row);
  if (trace.length > 30) trace.shift();
}
