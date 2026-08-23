// What position a dialog should take while a software keyboard comes and goes.
//
// Split out of useVisibleViewportInsets so it can be tested: everything here is
// pure and takes its measurements as arguments, so keyboardBand.test.ts can
// replay whole keyboard bursts with no browser, no timers and no React. The
// hook keeps only the plumbing (which events to listen to, when a burst has
// ended), which is what is left once the decisions live here.

/** The part of the layout viewport the user can currently see. */
export type Band = { offsetTop: number; height: number };

/** How far the visible band is inset from the layout viewport, in px. */
export type VisibleViewportInsets = { top: number; bottom: number };

/** Insets for a band, optionally pretending it has not slid.
 *
 *  `slide` null believes the band's own offset, which is measured fact. A
 *  number holds it at a remembered value instead, which is a guess about a
 *  slide still in flight: see `createBandTracker`.
 *
 *  A guess is capped where it would push the dialog BELOW where it sits with no
 *  keyboard at all. Without that cap, a slide remembered from before the
 *  keyboard began retracting rode the dialog down past its resting place and
 *  then snapped it back. Fact is never capped: a band that really has settled
 *  low is where the dialog belongs, however far down that is.
 */
export function insetsFrom(
  band: Band | null,
  slide: number | null,
  layout: number
): VisibleViewportInsets {
  if (!band) return { top: 0, bottom: 0 };
  const raw =
    slide === null ? band.offsetTop : Math.max(0, Math.min(slide, (layout - band.height) / 2));
  // Whole pixels. visualViewport reports fractions on real devices and the cap
  // halves one, so without this two readings a hundredth apart count as a move
  // and restart the frame's transition. A guess floors rather than rounds,
  // because the cap is a bound: at an exact half, rounding to nearest lands a
  // pixel past it and puts the dip straight back.
  const top = slide === null ? Math.round(raw) : Math.floor(raw);
  return { top, bottom: Math.max(0, Math.round(layout - top - band.height)) };
}

export type BandTracker = {
  /** The viewport is still moving: the slide cannot be believed yet. */
  moving: (band: Band | null, layout: number) => VisibleViewportInsets;
  /** The viewport has gone quiet: believe what it says, and remember it. */
  settled: (band: Band | null, layout: number) => VisibleViewportInsets;
};

/** Decide the insets for each reading in a burst of viewport activity.
 *
 *  Neither half of the band is believed on sight. An offset is held until the
 *  viewport is quiet because it is usually transient; a height is followed only
 *  when it SHRINKS, because only shrinking can hide the dialog.
 *
 *  The band's two halves move for different reasons and are believed on
 *  different terms. Its HEIGHT is the keyboard: a big, persistent change, and
 *  the one the dialog has to get out of the way of, so it is followed
 *  immediately and the dialog leaves as the keyboard arrives. Its OFFSET is the
 *  browser sliding the band around hunting for the focused field: transient,
 *  usually back at 0 once things settle, and following it is what walked the
 *  dialog about. So the last settled offset is held through the burst and only
 *  re-read once the viewport is quiet.
 *
 *  Splitting on WHICH quantity moved rather than on which direction the dialog
 *  went is what makes this independent of the order the events arrive in. An
 *  earlier attempt judged every later change against the direction of the first
 *  one, so when iOS led with the reveal scroll instead of the keyboard resize,
 *  "down" won and the real move up was held for the whole burst.
 */
export function createBandTracker(initialSlide: number, initialHeight: number): BandTracker {
  let settledSlide = initialSlide;
  let settledHeight = initialHeight;
  return {
    moving: (band, layout) => {
      // A band that has GROWN cannot hide the dialog: whatever fitted in the
      // smaller one fits in the bigger one too, in the same place. So growth is
      // deferred to the settle, and only shrinkage is followed at once.
      //
      // This is what iOS's accessory bar costs. It appears and disappears on its
      // own after the keyboard has already settled, each toggle worth about 44px
      // of band, and following the growth walked the card down half of that and
      // back up again a moment later: "it pops up fine, then the very top jumps
      // down a bit, then back up". Deferring it means the pair cancels and
      // nothing moves at all. A keyboard being dismissed is also growth, so that
      // move now lands at the settle rather than immediately, which is the cost.
      const held = band
        ? { offsetTop: band.offsetTop, height: Math.min(band.height, settledHeight) }
        : null;
      return insetsFrom(held, settledSlide, layout);
    },
    settled: (band, layout) => {
      settledSlide = band?.offsetTop ?? 0;
      settledHeight = band?.height ?? layout;
      return insetsFrom(band, null, layout);
    },
  };
}
