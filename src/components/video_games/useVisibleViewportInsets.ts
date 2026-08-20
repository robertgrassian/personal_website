import { useEffect, useState } from "react";

// How long the viewport must hold still before its geometry is believed. Long
// enough to swallow the gap between the keyboard's `resize` and the `scroll`
// that follows it, short enough that the dialog is already moving as the
// keyboard finishes animating (iOS runs that in roughly 250ms).
const SETTLE_MS = 120;

/** How far the visible band is inset from the layout viewport, in px. */
export type VisibleViewportInsets = { top: number; bottom: number };

// Read the current geometry. Safe on the server and where visualViewport is
// unsupported, both of which report nothing hidden.
//
// clientHeight, not innerHeight: innerHeight follows the visual viewport on the
// browsers that matter here, so it would report the band's own height and both
// insets would come out as zero.
function measureInsets(): VisibleViewportInsets {
  const viewport = typeof window === "undefined" ? null : window.visualViewport;
  if (!viewport) return { top: 0, bottom: 0 };
  const layoutHeight = document.documentElement.clientHeight;
  return {
    top: Math.max(0, viewport.offsetTop),
    bottom: Math.max(0, layoutHeight - viewport.offsetTop - viewport.height),
  };
}

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
 *  Both are 0 with no keyboard and where `visualViewport` is unsupported, so a
 *  caller adding them changes nothing until there is something to correct for.
 *
 *  Reports the settled geometry, not every intermediate one: see SETTLE_MS. A
 *  caller can treat each change as a finished position and animate to it.
 */
export function useVisibleViewportInsets(): VisibleViewportInsets {
  // Measured during the first render, not after it. The alternative, starting
  // at zero and correcting in an effect, is a real position change, and
  // ModalShell transitions those: a dialog mounted while the keyboard is
  // already up would animate in from where it does not belong.
  //
  // Only safe because every caller mounts on interaction and is never server
  // rendered. A server-rendered one would hydrate against the zeroes the server
  // sent and mismatch.
  const [insets, setInsets] = useState<VisibleViewportInsets>(measureInsets);

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
        const { top, bottom } = measureInsets();
        // Same object when nothing moved, so a scroll that does not change the
        // band cannot re-render every open dialog.
        setInsets((previous) =>
          previous.top === top && previous.bottom === bottom ? previous : { top, bottom }
        );
      }, delay);
    };

    // Immediately, not after SETTLE_MS: this only catches a viewport that moved
    // between the first render's reading and this effect.
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
