"use client";

import { useEffect, useRef, useState } from "react";

// Records what the card's box actually DID, rather than what the insets say it
// should have done.
//
// The distinction is the whole point of this file. The frame centres the card
// in its padding box, so a change in the insets moves the card AND resizes it:
// shrink the box and a centred card's top edge comes down while its bottom goes
// up. "The top jumps down a bit" therefore has two possible causes that no
// centre-based measurement can tell apart, and only one of them is a move.

export type RectSample = {
  t: number;
  top: number;
  bottom: number;
  height: number;
  /** The visible band at the moment of sampling, for lining the two up. */
  offsetTop: number;
  bandHeight: number;
  layout: number;
};

// Long enough to cover the keyboard animation plus the settle that follows it.
const WATCH_MS = 2500;

export function useRectLog(target: () => Element | null) {
  const [samples, setSamples] = useState<RectSample[]>([]);
  const originRef = useRef(0);
  const lastRef = useRef<string>("");

  useEffect(() => {
    let raf = 0;
    let until = 0;

    const sample = () => {
      const el = target();
      if (el) {
        const r = el.getBoundingClientRect();
        const viewport = window.visualViewport;
        // Only distinct boxes: sampling every frame otherwise buries the two or
        // three changes that matter in a hundred identical rows.
        const key = `${Math.round(r.top)}:${Math.round(r.height)}`;
        if (key !== lastRef.current) {
          lastRef.current = key;
          setSamples((previous) =>
            [
              ...previous,
              {
                t: Math.round(performance.now() - originRef.current),
                top: Math.round(r.top),
                bottom: Math.round(r.bottom),
                height: Math.round(r.height),
                offsetTop: Math.round(viewport?.offsetTop ?? 0),
                bandHeight: Math.round(viewport?.height ?? 0),
                layout: document.documentElement.clientHeight,
              },
            ].slice(-60)
          );
        }
      }
      if (performance.now() < until) raf = requestAnimationFrame(sample);
    };

    // Watch for a while after anything happens, so the padding transition and
    // the settle that follows it are both inside the window.
    const kick = () => {
      const now = performance.now();
      if (originRef.current === 0 || now - until > 3000) originRef.current = now;
      until = now + WATCH_MS;
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(sample);
    };

    const viewport = window.visualViewport;
    viewport?.addEventListener("resize", kick);
    viewport?.addEventListener("scroll", kick);
    window.addEventListener("focusin", kick);
    kick();

    return () => {
      cancelAnimationFrame(raf);
      viewport?.removeEventListener("resize", kick);
      viewport?.removeEventListener("scroll", kick);
      window.removeEventListener("focusin", kick);
    };
  }, [target]);

  return { samples, clear: () => setSamples([]) };
}
