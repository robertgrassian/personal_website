// The decision behind the sticky library header's mobile hide-on-scroll,
// with no React in it so `npm test` can replay a phone's scroll sequence
// without a browser or a dependency install. `useHideOnScrollDown.ts` is the
// hook that feeds it real samples.

// Minimum scroll distance (px) before toggling visibility. Filters out
// micro-reversals from slow or momentum scrolling.
const MIN_SCROLL_DELTA = 10;

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
  /** Did the previous sample also move down? Hiding needs two in a row. */
  wasDescending: boolean;
};

export function initialHideOnScrollState(reading: ScrollReading): HideOnScrollState {
  return {
    visible: true,
    anchor: reading.scrollY,
    lastScrollY: reading.scrollY,
    lastViewportHeight: reading.viewportHeight,
    wasDescending: false,
  };
}

/** Pure decision for one scroll sample. Split out of the hook so the sequences
 *  that only happen on a phone can be replayed in a test.
 *
 *  Hiding is deliberately harder to trigger than showing, because the sequence
 *  this guards against is a bar that hides itself in the middle of a fast
 *  scroll UP. `scrollY` is not monotonic on a phone: a browser toolbar sliding
 *  back in during a fling reports a jump in the opposite direction to the
 *  finger, which the old "accumulate since the last toggle" rule read as a
 *  scroll down. Two independent guards block it, and a spurious SHOW is left
 *  alone in both — the bar appearing when the user is already reaching for it
 *  costs nothing. */
export function nextHideOnScrollState(
  state: HideOnScrollState,
  reading: ScrollReading,
  stickyThreshold: number
): HideOnScrollState {
  const { scrollY, viewportHeight } = reading;
  const resized = viewportHeight !== state.lastViewportHeight;

  // Above the point where sticky engages: always show, and keep the anchor
  // current so the delta starts fresh on re-entering the sticky zone.
  if (scrollY < stickyThreshold) {
    return {
      visible: true,
      anchor: scrollY,
      lastScrollY: scrollY,
      lastViewportHeight: viewportHeight,
      wasDescending: false,
    };
  }

  const step = scrollY - state.lastScrollY;
  if (step === 0)
    return state.lastViewportHeight === viewportHeight
      ? state
      : { ...state, lastViewportHeight: viewportHeight };

  // A reversal starts a new run, so travel is measured from where the direction
  // changed rather than from before it.
  const run = state.lastScrollY - state.anchor;
  const reversed = run !== 0 && Math.sign(step) !== Math.sign(run);
  const anchor = reversed ? state.lastScrollY : state.anchor;
  const travelled = scrollY - anchor;
  const descending = step > 0;

  const carried = {
    lastScrollY: scrollY,
    lastViewportHeight: viewportHeight,
    wasDescending: descending,
  };

  // Scrolling up means the user is reaching for the controls.
  if (travelled < -MIN_SCROLL_DELTA) {
    return { ...carried, visible: true, anchor: scrollY };
  }
  // Guard one: a lone downward sample is an outlier, not a gesture. Guard two:
  // a sample that also changed the viewport height carries the browser's own
  // toolbar adjustment, so its direction means nothing.
  if (travelled > MIN_SCROLL_DELTA && descending && state.wasDescending && !resized) {
    return { ...carried, visible: false, anchor: scrollY };
  }
  return { ...state, ...carried, anchor };
}
