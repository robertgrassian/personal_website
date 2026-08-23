import { useEffect, useState } from "react";
import { insetsFrom, type Band, type VisibleViewportInsets } from "./keyboardBand";

export type { VisibleViewportInsets };

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
 *  can sit partly off screen; the VISUAL viewport is the band the user actually
 *  sees, and it slides around inside the layout one, which is how the browser
 *  reveals the field you just tapped. `useKeepResultsInView` reads the same
 *  offset to land the sticky filter bar somewhere visible.
 *
 *  So an `inset-0` overlay is not wrong about the screen, it is right about a
 *  box part of which is not on it: a dialog centered in that box is centered
 *  partly out of sight. Returning the two strips rather than a box lets the
 *  caller keep its `fixed inset-0` element exactly as it is and pad the hidden
 *  parts away, which matters here because that element's insets are already
 *  load-bearing for the device safe areas.
 *
 *  Both are 0 with no keyboard and where `visualViewport` is unsupported, so a
 *  caller adding them changes nothing until there is something to correct for.
 *  On iOS 26 they are 0 even WITH one, because it shrinks the layout viewport to
 *  the space above the keyboard and there is nothing left to correct; the
 *  measurement stays because older iOS and Android do not.
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
    insetsFrom(readBand(), layoutHeight())
  );

  useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) return;

    let frame = 0;

    const apply = () => {
      const next = insetsFrom(readBand(), layoutHeight());
      // Same object when nothing moved, so a scroll that does not change the
      // band cannot re-render every open dialog. Pure, because React may invoke
      // an updater more than once for a single update.
      setInsets((previous) =>
        previous.top === next.top && previous.bottom === next.bottom ? previous : next
      );
    };

    // A frame, not a settle timer. Every reading is believed as it arrives: see
    // keyboardBand.ts for why holding one back is what caused the wobble rather
    // than what smoothed it. Coalescing to a frame is only to avoid measuring
    // twice for a resize and a scroll that land together.
    const onViewportChange = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(apply);
    };

    // Catches a viewport that moved between the first render's reading and this
    // effect.
    apply();

    // Both events, not just resize: the keyboard opening is a resize, but the
    // browser sliding the band onto the focused field is a scroll, and
    // listening for only one of them leaves the measurement stale for the
    // other. That staleness is why an earlier attempt at this was reverted.
    viewport.addEventListener("resize", onViewportChange);
    viewport.addEventListener("scroll", onViewportChange);
    return () => {
      cancelAnimationFrame(frame);
      viewport.removeEventListener("resize", onViewportChange);
      viewport.removeEventListener("scroll", onViewportChange);
    };
  }, []);

  return insets;
}
