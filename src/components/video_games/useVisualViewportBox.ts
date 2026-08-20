import { useEffect, useState } from "react";

/** Where the user can actually see, in `position: fixed` coordinates. */
export type ViewportBox = { top: number; left: number; width: number; height: number };

/** Track the visual viewport: the band of the page the user can see right now.
 *
 *  With a software keyboard open there are two viewports, and this is the one
 *  that matters. The LAYOUT viewport (what `position: fixed`, `inset-0`, `100vh`
 *  and `100dvh` all resolve against) keeps its full-screen size; the VISUAL
 *  viewport shrinks to the strip above the keyboard and can be scrolled around
 *  inside the layout one. `useKeepResultsInView` already relies on the same
 *  split for the sticky filter bar.
 *
 *  Two consequences for a `fixed inset-0` overlay, both reported as one bug:
 *  it extends behind the keyboard, so a centered dialog is centered on a box
 *  half of which cannot be seen; and when the browser scrolls the visual
 *  viewport down to reveal the focused field, the overlay stays with the layout
 *  viewport and slides out of view, showing the page behind it in the gap.
 *
 *  Returns null before the first measurement and where `visualViewport` is
 *  unsupported, so the caller keeps its static full-viewport fallback.
 */
export function useVisualViewportBox(): ViewportBox | null {
  const [box, setBox] = useState<ViewportBox | null>(null);

  useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) return;

    // Coalesce to one measurement per frame: the keyboard animation fires these
    // events in bursts, and every one of them would otherwise be a render.
    let frame = 0;
    const measure = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        setBox({
          // offsetTop/offsetLeft are the visual viewport's offset INSIDE the
          // layout viewport, which is the coordinate space `fixed` uses.
          top: viewport.offsetTop,
          left: viewport.offsetLeft,
          width: viewport.width,
          height: viewport.height,
        });
      });
    };

    measure();
    // Both events, not just resize: the keyboard opening is a resize, but the
    // browser scrolling the band down onto the focused field is a scroll, and
    // reacting to only one of them leaves the box stale for the other.
    viewport.addEventListener("resize", measure);
    viewport.addEventListener("scroll", measure);
    return () => {
      cancelAnimationFrame(frame);
      viewport.removeEventListener("resize", measure);
      viewport.removeEventListener("scroll", measure);
    };
  }, []);

  return box;
}
