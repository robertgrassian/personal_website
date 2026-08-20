import { useEffect, useState } from "react";

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
 */
export function useVisibleViewportInsets(): VisibleViewportInsets {
  const [insets, setInsets] = useState<VisibleViewportInsets>({ top: 0, bottom: 0 });

  useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) return;

    // Coalesce to one measurement per frame: the keyboard animation fires these
    // events in bursts, and every one of them would otherwise be a render.
    let frame = 0;
    const measure = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
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
      });
    };

    measure();
    // Both events, not just resize: the keyboard opening is a resize, but the
    // browser scrolling the band down onto the focused field is a scroll, and
    // listening for only one of them leaves the measurement stale for the
    // other. That staleness is why an earlier attempt at this was reverted.
    viewport.addEventListener("resize", measure);
    viewport.addEventListener("scroll", measure);
    return () => {
      cancelAnimationFrame(frame);
      viewport.removeEventListener("resize", measure);
      viewport.removeEventListener("scroll", measure);
    };
  }, []);

  return insets;
}
