import { useEffect, useState } from "react";
import {
  createBandTracker,
  insetsFrom,
  type Band,
  type VisibleViewportInsets,
} from "./keyboardBand";

export type { VisibleViewportInsets };

// Quiet long enough to call the keyboard finished, at which point whatever the
// viewport now says is final and is believed. Comfortably past the ~250ms iOS
// spends animating plus the scroll that lands after it.
const BURST_END_MS = 400;

// clientHeight, not innerHeight: innerHeight follows the visual viewport on the
// browsers that matter here, so it would report the band's own height and both
// insets would come out as zero.
function layoutHeight(): number {
  return typeof document === "undefined" ? 0 : document.documentElement.clientHeight;
}

function readBand(): Band | null {
  const viewport = typeof window === "undefined" ? null : window.visualViewport;
  return viewport ? { offsetTop: Math.max(0, viewport.offsetTop), height: viewport.height } : null;
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
 *  Moves once per keyboard rather than once per event. The rules for that live
 *  in keyboardBand.ts, which is where they are tested; this only decides when to
 *  ask. A caller can treat each change as a finished position and animate to it.
 */
export function useVisibleViewportInsets(): VisibleViewportInsets {
  // Measured during the first render, not after it. The alternative, starting
  // at zero and correcting in an effect, is a real position change, and
  // ModalFrame transitions those: a dialog mounted while the keyboard is
  // already up would animate in from where it does not belong.
  //
  // Only safe because every caller mounts on interaction and is never server
  // rendered. A server-rendered one would hydrate against the zeroes the server
  // sent and mismatch.
  const [insets, setInsets] = useState<VisibleViewportInsets>(() =>
    insetsFrom(readBand(), null, layoutHeight())
  );

  useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) return;

    const tracker = createBandTracker(readBand()?.offsetTop ?? 0);
    let frame = 0;
    let burstTimer: ReturnType<typeof setTimeout> | undefined;

    const apply = (next: VisibleViewportInsets) =>
      // Same object when nothing moved, so a scroll that does not change the
      // band cannot re-render every open dialog. Pure, because React may invoke
      // an updater more than once for a single update.
      setInsets((previous) =>
        previous.top === next.top && previous.bottom === next.bottom ? previous : next
      );

    // A frame, not a settle timer. A 120ms one here used to try to swallow the
    // opposing pair that keyboardBand separates by quantity instead, and all it
    // did besides was delay the dialog leaving by 120ms.
    const onViewportChange = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => apply(tracker.moving(readBand(), layoutHeight())));
      clearTimeout(burstTimer);
      burstTimer = setTimeout(
        () => apply(tracker.settled(readBand(), layoutHeight())),
        BURST_END_MS
      );
    };

    // Catches a viewport that moved between the first render's reading and this
    // effect. Settled, not moving: nothing is in flight to hold an offset
    // through.
    apply(tracker.settled(readBand(), layoutHeight()));

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
