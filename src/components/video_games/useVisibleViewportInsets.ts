import { useEffect, useState } from "react";

// How long the viewport must hold still before its geometry is believed. Long
// enough to swallow the gap between the keyboard's `resize` and the `scroll`
// that follows it, short enough that the dialog is already moving as the
// keyboard finishes animating (iOS runs that in roughly 250ms).
const SETTLE_MS = 120;

/** How far the visible band is inset from the layout viewport, in px. */
export type VisibleViewportInsets = { top: number; bottom: number };

/** Measure the strips of the layout viewport the user cannot currently see.
 *
 *  With a software keyboard open there are two viewports. The LAYOUT viewport
 *  (what `position: fixed`, `inset-0`, `100vh` and `100dvh` resolve against)
 *  keeps its full-screen height; the VISUAL viewport shrinks to the band above
 *  the keyboard and slides around inside the layout one, which is also how the
 *  browser reveals the field you just tapped. `useKeepResultsInView` reads the
 *  same offset to land the sticky filter bar somewhere visible.
 *
 *  So an `inset-0` overlay is not wrong about the screen, it is right about a
 *  box the keyboard has taken half of: a dialog centered in it is centered
 *  partly out of sight. Returning the two strips rather than a box lets the
 *  caller keep its `fixed inset-0` element exactly as it is and pad the hidden
 *  parts away, which matters here because that element's insets are already
 *  load-bearing for the device safe areas.
 *
 *  Both are 0 with no keyboard, where `visualViewport` is unsupported, and
 *  before the first measurement, so a caller adding them changes nothing until
 *  there is something to correct for.
 *
 *  Reports the settled geometry, not every intermediate one: see SETTLE_MS. A
 *  caller can treat each change as a finished position and animate to it.
 */
export function useVisibleViewportInsets(): VisibleViewportInsets {
  const [insets, setInsets] = useState<VisibleViewportInsets>({ top: 0, bottom: 0 });

  useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) return;

    // Commit once the viewport has held still for SETTLE_MS, rather than once
    // per frame. Raising the keyboard reports its result in two steps that pull
    // in opposite directions -- a `resize` to the short band, then a `scroll`
    // sliding that band down onto the focused field -- and committing each one
    // moved the dialog up and then back down, which read as a bug. Waiting for
    // the pair means one move, after the keyboard animation it belongs to.
    let timer: ReturnType<typeof setTimeout> | undefined;
    const measure = (delay = SETTLE_MS) => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        // clientHeight, not innerHeight: innerHeight follows the visual
        // viewport on the browsers that matter here, so it would report the
        // band's own height and both insets would come out as zero.
        const layoutHeight = document.documentElement.clientHeight;
        const top = Math.max(0, viewport.offsetTop);
        const bottom = Math.max(0, layoutHeight - viewport.offsetTop - viewport.height);
        // Same object when nothing moved, so a scroll that does not change the
        // band cannot re-render every open dialog.
        setInsets((previous) =>
          previous.top === top && previous.bottom === bottom ? previous : { top, bottom }
        );
      }, delay);
    };

    // The mount reading is whatever is already true, so it has nothing to wait
    // for: a dialog opened while the keyboard is up must not spend SETTLE_MS
    // centered behind it.
    measure(0);
    // Wrapped rather than passed straight in: a listener is handed the event as
    // its first argument, which would land where `delay` goes.
    const onViewportChange = () => measure();
    // Both events, not just resize: the keyboard opening is a resize, but the
    // browser scrolling the band down onto the focused field is a scroll, and
    // listening for only one of them leaves the measurement stale for the
    // other. That staleness is why an earlier attempt at this was reverted.
    viewport.addEventListener("resize", onViewportChange);
    viewport.addEventListener("scroll", onViewportChange);
    return () => {
      clearTimeout(timer);
      viewport.removeEventListener("resize", onViewportChange);
      viewport.removeEventListener("scroll", onViewportChange);
    };
  }, []);

  return insets;
}
