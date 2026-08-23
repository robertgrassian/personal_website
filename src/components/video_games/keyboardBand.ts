// What part of the layout viewport a software keyboard has taken, so a dialog
// centred in that viewport can pad it away.
//
// Split out of useVisibleViewportInsets so it can be tested: everything here is
// pure and takes its measurements as arguments, so keyboardBand.test.ts can
// replay whole keyboard bursts with no browser, no timers and no React. The
// hook keeps only the plumbing, which is which events to listen to.

/** The part of the layout viewport the user can currently see. */
export type Band = { offsetTop: number; height: number };

/** How far the visible band is inset from the layout viewport, in px. */
export type VisibleViewportInsets = { top: number; bottom: number };

/** Insets for a band.
 *
 *  Every reading is believed on sight. Four earlier attempts held one half or
 *  the other back through a burst, on the theory that the offset is a transient
 *  hunt for the focused field and settles back at 0. A capture from the device
 *  says otherwise: focusing a field in the card moves the band to offsetTop 42
 *  and it STAYS there for as long as the keyboard is up, so holding it is not
 *  smoothing over a transient — it is being wrong for the length of the hold,
 *  and then correcting, which is the wobble those attempts were chasing.
 *
 *  The same capture explains why the height half needs no rule either. iOS now
 *  shrinks the LAYOUT viewport with the keyboard (layout 733 -> 471 against a
 *  band of 429), so the strip below the band comes out at 0 and the top inset
 *  carries the whole correction.
 *
 *  Whole pixels: visualViewport reports fractions on real devices, and without
 *  rounding two readings a hundredth apart count as a move and restart the
 *  frame's padding transition. */
export function insetsFrom(band: Band | null, layout: number): VisibleViewportInsets {
  if (!band) return { top: 0, bottom: 0 };
  const top = Math.round(band.offsetTop);
  return { top, bottom: Math.max(0, Math.round(layout - top - band.height)) };
}
