// The decision behind the sticky library header's mobile hide-on-scroll,
// with no React in it so `npm test` can replay a phone's scroll sequence
// without a browser or a dependency install. `useHideOnScrollDown.ts` is the
// hook that feeds it real samples.

// Minimum scroll distance (px) before toggling visibility. Filters out
// micro-reversals from slow or momentum scrolling.
const MIN_SCROLL_DELTA = 10;

// How long the bar refuses to leave after the browser's chrome moves. Covers a
// toolbar animation, which runs 200-350ms.
const HOLD_MS = 500;

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
  /** `performance.now()`. */
  now: number;
};

export type HideOnScrollState = {
  visible: boolean;
  /** Where the current run of travel is measured from: the last toggle or the
   *  last direction reversal, whichever came later. */
  anchor: number;
  lastScrollY: number;
  lastViewportHeight: number;
  /** The bar will not hide before this. */
  holdUntil: number;
};

export function initialHideOnScrollState(reading: ScrollReading): HideOnScrollState {
  return {
    visible: true,
    anchor: reading.scrollY,
    lastScrollY: reading.scrollY,
    lastViewportHeight: reading.viewportHeight,
    // 0, not `now`: the bar has not just arrived, it was never away, so the
    // hold must not block the first hide of the session.
    holdUntil: 0,
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
 *  is the browser saying "they want the chrome back". Show on it, which is both
 *  earlier and more reliable than inferring intent from scroll deltas, and
 *  refuse to hide for as long as the toolbar might still be paying for itself.
 *  Where the toolbar is not observable (a standalone window, one already fully
 *  out) it also does not move the document, and the scroll rule below is
 *  enough on its own.
 *
 *  Hiding is the only direction that gets held. The bar appearing while someone
 *  is already reaching for it costs nothing, so no guard here defends against
 *  a spurious show. */
export function nextHideOnScrollState(
  state: HideOnScrollState,
  reading: ScrollReading,
  stickyThreshold: number
): HideOnScrollState {
  const { scrollY, viewportHeight, now } = reading;
  // Signed, and the sign is the whole point: a viewport that SHRANK lost the
  // space to a toolbar sliding in, one that grew got it back.
  const heightChange = viewportHeight - state.lastViewportHeight;
  const carried = { ...state, lastScrollY: scrollY, lastViewportHeight: viewportHeight };

  // The toolbar arriving. Only a shrink arms the hold: a viewport growing back
  // pays in pixels pointing up, which can do nothing worse than show a bar that
  // is already wanted.
  if (heightChange < 0 && -heightChange <= MAX_TOOLBAR_HEIGHT) {
    return { ...carried, visible: true, anchor: scrollY, holdUntil: now + HOLD_MS };
  }

  // Above the point where sticky engages: always show, and keep the anchor
  // current so the delta starts fresh on re-entering the sticky zone.
  if (scrollY < stickyThreshold) {
    return { ...carried, visible: true, anchor: scrollY };
  }

  const step = scrollY - state.lastScrollY;
  if (step === 0) return carried;

  // A reversal starts a new run, so travel is measured from where the direction
  // changed rather than from before it.
  const run = state.lastScrollY - state.anchor;
  const anchor = run !== 0 && Math.sign(step) !== Math.sign(run) ? state.lastScrollY : state.anchor;
  const travelled = scrollY - anchor;

  // Scrolling up means the user is reaching for the controls.
  if (travelled < -MIN_SCROLL_DELTA) {
    return { ...carried, visible: true, anchor: scrollY, holdUntil: now + HOLD_MS };
  }
  if (travelled > MIN_SCROLL_DELTA && now >= state.holdUntil) {
    return { ...carried, visible: false, anchor: scrollY };
  }
  return { ...carried, anchor };
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
  held: number;
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
