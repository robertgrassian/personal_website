import { useEffect, useRef, useState } from "react";

// Quiet long enough to call the keyboard finished, at which point whatever the
// viewport now says is final and is committed unconditionally. Comfortably past
// the ~250ms iOS spends animating plus the scroll that lands after it.
const BURST_END_MS = 400;

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

// Where a panel centered in the padded frame ends up, in layout-viewport
// coordinates. Derived from the insets rather than measured separately, so it
// cannot disagree with what ModalFrame's padding actually does.
function centerOf({ top, bottom }: VisibleViewportInsets): number {
  return top + (document.documentElement.clientHeight - top - bottom) / 2;
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
 *  Moves once per keyboard rather than once per event: see burstDirection. A
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

  // Mirrors `insets` so the commit logic can read the current value without
  // running inside a setState updater. React may invoke an updater more than
  // once for one update, so the burst bookkeeping cannot live in there.
  const insetsRef = useRef(insets);

  useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) return;

    // Which way the dialog moved when this burst of viewport activity started.
    // 0 between bursts. Raising a keyboard reports its result in steps that
    // pull in opposite directions: a `resize` to the short band, then a
    // `scroll` sliding that band down onto the focused field, then often a
    // spring back. Committing each one walked the dialog up, down and back up.
    //
    // A settle timer alone cannot fix that, which is what the previous attempt
    // assumed: the steps are as far apart as the keyboard animation is long, so
    // any timer short enough to keep the dialog responsive is too short to span
    // them. Direction does not care how they are spaced. The first move goes
    // through immediately, so the dialog still leaves with the keyboard; a
    // later step that would send it back the other way is held until the
    // viewport is quiet, and by then it has usually been undone anyway.
    let burstDirection = 0;
    let frame = 0;
    let burstTimer: ReturnType<typeof setTimeout> | undefined;

    const commit = (final: boolean) => {
      const next = measureInsets();
      const previous = insetsRef.current;
      // Same object when nothing moved, so a scroll that does not change the
      // band cannot re-render every open dialog.
      if (previous.top === next.top && previous.bottom === next.bottom) return;

      const direction = Math.sign(centerOf(next) - centerOf(previous));
      if (!final && burstDirection !== 0 && direction !== 0 && direction !== burstDirection) {
        return; // a reversal mid-burst: hold, and let the burst's end decide
      }
      if (burstDirection === 0) burstDirection = direction;

      insetsRef.current = next;
      setInsets(next);
    };

    // A frame, not a settle timer. The old 120ms one was trying to swallow the
    // opposing pair that burstDirection now handles, and all it did besides was
    // delay the dialog leaving with the keyboard by 120ms. This only coalesces
    // a burst arriving inside one frame.
    const onViewportChange = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => commit(false));
      clearTimeout(burstTimer);
      burstTimer = setTimeout(() => {
        burstDirection = 0;
        commit(true);
      }, BURST_END_MS);
    };

    // Catches a viewport that moved between the first render's reading and this
    // effect. Unconditional: there is no burst in progress to reverse.
    commit(true);
    // Both events, not just resize: the keyboard opening is a resize, but the
    // browser scrolling the band down onto the focused field is a scroll, and
    // listening for only one of them leaves the measurement stale for the
    // other. That staleness is why an earlier attempt at this was reverted.
    viewport.addEventListener("resize", onViewportChange);
    viewport.addEventListener("scroll", onViewportChange);
    return () => {
      cancelAnimationFrame(frame);
      clearTimeout(burstTimer);
      viewport.removeEventListener("resize", onViewportChange);
      viewport.removeEventListener("scroll", onViewportChange);
    };
  }, []);

  return insets;
}
