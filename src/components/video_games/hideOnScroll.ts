// The decision behind the sticky library header's mobile hide-on-scroll,
// with no React in it so `npm test` can replay a phone's scroll sequence
// without a browser or a dependency install. `useHideOnScrollDown.ts` is the
// hook that feeds it real samples.

// Minimum scroll distance (px) before toggling visibility. Filters out
// micro-reversals from slow or momentum scrolling.
const MIN_SCROLL_DELTA = 10;

// How long after arriving the bar refuses to leave again. A browser toolbar
// animation runs 200-350ms and reports scroll the finger never made; nothing a
// person does inside that window wants the bar gone.
const SETTLE_MS = 500;

// Ceiling on the chrome budget below, so a run of resizes cannot bank enough
// credit to swallow real scrolling.
const MAX_CHROME_DEBT = 200;

/** One scroll sample, as the decision below needs to see it. */
export type ScrollReading = {
  scrollY: number;
  /** `window.innerHeight`. Mobile browsers resize it as their own toolbar
   *  slides in and out, and that is the only signal separating a scroll the
   *  finger made from the browser compensating for its own chrome. */
  viewportHeight: number;
  /** `performance.now()`. */
  now: number;
};

export type HideOnScrollState = {
  visible: boolean;
  /** Where the current run of travel is measured from: the last toggle, the
   *  last direction reversal, or the last absorbed chrome pixel. */
  anchor: number;
  lastScrollY: number;
  lastViewportHeight: number;
  /** Did the previous sample also move down? Hiding needs two in a row. */
  wasDescending: boolean;
  /** Downward pixels still attributable to the browser resizing its own chrome
   *  rather than to the finger. */
  chromeDebt: number;
  /** When the bar last became visible, for SETTLE_MS. */
  shownAt: number;
};

export function initialHideOnScrollState(reading: ScrollReading): HideOnScrollState {
  return {
    visible: true,
    anchor: reading.scrollY,
    lastScrollY: reading.scrollY,
    lastViewportHeight: reading.viewportHeight,
    wasDescending: false,
    chromeDebt: 0,
    // Not `now`: the bar has not "just arrived", it was never away, so the
    // settle window must not block the first hide of the session.
    shownAt: Number.NEGATIVE_INFINITY,
  };
}

/** Pure decision for one scroll sample. Split out of the hook so the sequences
 *  that only happen on a phone can be replayed in a test.
 *
 *  Hiding is deliberately much harder to trigger than showing, because the
 *  failure this exists to prevent is the bar hiding itself in the middle of a
 *  fast scroll UP. `scrollY` is not monotonic on a phone: a browser toolbar
 *  sliding back in resizes the viewport and the browser moves the document to
 *  compensate, which arrives as ordinary scroll events pointing against the
 *  finger, and can arrive several frames after the resize that caused them.
 *
 *  Three guards, each covering what the others miss, and a spurious SHOW is
 *  left alone in all of them because the bar appearing when the user is already
 *  reaching for it costs nothing:
 *
 *  1. two consecutive downward samples, so a lone outlier is not a gesture;
 *  2. a chrome budget, so the browser can never move the page by more than it
 *     moved its own chrome without those pixels being discounted;
 *  3. a settle window after the bar appears, which holds whatever the first two
 *     did not anticipate. */
export function nextHideOnScrollState(
  state: HideOnScrollState,
  reading: ScrollReading,
  stickyThreshold: number
): HideOnScrollState {
  const { scrollY, viewportHeight, now } = reading;
  const heightChange = Math.abs(viewportHeight - state.lastViewportHeight);

  // Above the point where sticky engages: always show, and keep the anchor
  // current so the delta starts fresh on re-entering the sticky zone.
  if (scrollY < stickyThreshold) {
    return {
      ...state,
      visible: true,
      shownAt: state.visible ? state.shownAt : now,
      anchor: scrollY,
      lastScrollY: scrollY,
      lastViewportHeight: viewportHeight,
      wasDescending: false,
      chromeDebt: 0,
    };
  }

  let anchor = state.anchor;
  let chromeDebt = state.chromeDebt;

  // The browser just resized its own chrome. The page movement that pays for
  // that can land on this sample or the next few, so both forget the travel
  // banked so far and credit the same number of pixels forward.
  if (heightChange > 0) {
    anchor = state.lastScrollY;
    chromeDebt = Math.min(chromeDebt + heightChange, MAX_CHROME_DEBT);
  }

  const step = scrollY - state.lastScrollY;
  if (step === 0) {
    return { ...state, anchor, chromeDebt, lastViewportHeight: viewportHeight };
  }

  // A reversal starts a new run, so travel is measured from where the direction
  // changed rather than from before it.
  const run = state.lastScrollY - anchor;
  if (run !== 0 && Math.sign(step) !== Math.sign(run)) anchor = state.lastScrollY;

  const descending = step > 0;
  // Spend the budget first: those pixels are the browser's, not the finger's.
  if (descending && chromeDebt > 0) {
    const absorbed = Math.min(chromeDebt, step);
    chromeDebt -= absorbed;
    anchor += absorbed;
  }

  const travelled = scrollY - anchor;
  const carried = {
    ...state,
    anchor,
    chromeDebt,
    lastScrollY: scrollY,
    lastViewportHeight: viewportHeight,
    wasDescending: descending,
  };

  // Scrolling up means the user is reaching for the controls.
  if (travelled < -MIN_SCROLL_DELTA) {
    return {
      ...carried,
      visible: true,
      shownAt: state.visible ? state.shownAt : now,
      anchor: scrollY,
    };
  }
  if (
    travelled > MIN_SCROLL_DELTA &&
    descending &&
    state.wasDescending &&
    now - state.shownAt > SETTLE_MS
  ) {
    return { ...carried, visible: false, anchor: scrollY };
  }
  return carried;
}

// --- on-device trace --------------------------------------------------------
//
// Off unless something turns it on, which only ViewportRecorder does, so this
// costs one null check per scroll event in production. It exists because the
// only place this bug happens is a phone with no console, and the question it
// answers is narrow: on the sample that hid the bar, which way did scrollY go
// and did innerHeight move with it?

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
