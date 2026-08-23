import { useEffect, useState } from "react";

// Quiet long enough to call the keyboard finished, at which point whatever the
// viewport now says is final and is committed unconditionally. Comfortably past
// the ~250ms iOS spends animating plus the scroll that lands after it.
const BURST_END_MS = 400;

/** How far the visible band is inset from the layout viewport, in px. */
export type VisibleViewportInsets = { top: number; bottom: number };

// The visible band, straight from the browser.
//
// clientHeight, not innerHeight: innerHeight follows the visual viewport on the
// browsers that matter here, so it would report the band's own height and both
// insets would come out as zero.
type Band = { offsetTop: number; height: number };

function readBand(): Band | null {
  const viewport = typeof window === "undefined" ? null : window.visualViewport;
  return viewport ? { offsetTop: Math.max(0, viewport.offsetTop), height: viewport.height } : null;
}

// Insets for a band, optionally pretending it has not slid.
//
// `slide` null believes the band's own offset. A number holds it at that value
// instead, which is how a mid-keyboard reading is used: see the effect below.
// Clamped, so a slide held over from a taller band cannot outlive it and push
// the panel past the bottom of a shorter one.
function insetsFrom(band: Band | null, slide: number | null): VisibleViewportInsets {
  if (!band) return { top: 0, bottom: 0 };
  const layout = document.documentElement.clientHeight;
  const top = slide === null ? band.offsetTop : Math.min(slide, Math.max(0, layout - band.height));
  return { top, bottom: Math.max(0, layout - top - band.height) };
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
 *  Moves once per keyboard rather than once per event: see the effect. A caller
 *  can treat each change as a finished position and animate to it.
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
  const [insets, setInsets] = useState<VisibleViewportInsets>(() => insetsFrom(readBand(), null));

  useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) return;

    // The two halves of the band move for different reasons and are believed on
    // different terms.
    //
    // Its HEIGHT is the keyboard: a big, persistent change, and the one the
    // dialog has to get out of the way of. Followed immediately, so the dialog
    // still leaves as the keyboard arrives.
    //
    // Its OFFSET is the browser sliding the band around hunting for the focused
    // field. That is transient, usually back at 0 by the time everything
    // settles, and following it is what walked the dialog around: down 55px on
    // a slide, up again when it sprang back. So the last settled offset is held
    // through the burst and only re-read once the viewport has been quiet.
    //
    // Direction was the previous attempt at this and had an ordering assumption
    // in it: the first change of a burst set the direction every later one was
    // judged against, so when iOS led with the reveal scroll instead of the
    // resize, "down" won and the real move up was held for the full 400ms. The
    // dialog dropped low, sat there, then popped up. Which quantity moved does
    // not depend on what order they arrive in.
    let settledSlide = readBand()?.offsetTop ?? 0;
    let frame = 0;
    let burstTimer: ReturnType<typeof setTimeout> | undefined;

    const apply = (slide: number | null) => {
      const next = insetsFrom(readBand(), slide);
      // Same object when nothing moved, so a scroll that does not change the
      // band cannot re-render every open dialog.
      setInsets((previous) =>
        previous.top === next.top && previous.bottom === next.bottom ? previous : next
      );
    };

    // A frame, not a settle timer. The 120ms one this replaced was trying to
    // swallow an opposing pair that is now separated by quantity instead, and
    // all it did besides was delay the dialog leaving by 120ms.
    const onViewportChange = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => apply(settledSlide));
      clearTimeout(burstTimer);
      burstTimer = setTimeout(() => {
        settledSlide = readBand()?.offsetTop ?? 0;
        apply(null);
      }, BURST_END_MS);
    };

    // Catches a viewport that moved between the first render's reading and this
    // effect. Believes the offset: nothing is in flight to hold it through.
    apply(null);
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
