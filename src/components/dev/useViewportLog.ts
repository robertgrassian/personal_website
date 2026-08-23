"use client";

import { useEffect, useRef, useState } from "react";

// Samples where things ARE, every frame, while the page is busy.
//
// The point is to measure what happened rather than what should have. A dialog
// centred in a padded frame moves when the padding changes AND resizes when the
// frame does, and "the top edge jumped" cannot tell those apart; a library that
// rises behind a dialog may have scrolled, or may just be riding a viewport
// that slid. Each of those is a different bug with a different fix, and they
// are only distinguishable side by side.

export type ViewportSample = {
  t: number;
  top: number;
  bottom: number;
  height: number;
  /** Client top of a shelf case: where the LIBRARY is on screen. */
  anchorTop: number;
  /** Where the visible band starts inside the layout viewport. */
  offsetTop: number;
  /** The visible band's height, which a keyboard shrinks. */
  bandHeight: number;
  /** documentElement.clientHeight, which SOME browsers shrink for a keyboard
   *  and others leave alone. Reading it next to the band is what tells the two
   *  models apart. */
  layout: number;
  scrollY: number;
};

// Long enough to cover a keyboard animation and the 560ms card flight.
const WATCH_MS = 3000;

type Targets = {
  card: () => Element | null;
  anchor: () => Element | null;
  /** Off unless ?debug. Sampling regardless would put a React state update
   *  on every frame of the animations this exists to measure, which is both
   *  waste on every local page load and a confound in the measurement. */
  enabled: boolean;
};

export function useViewportLog({ card, anchor, enabled }: Targets) {
  const [samples, setSamples] = useState<ViewportSample[]>([]);
  const originRef = useRef(0);
  const lastRef = useRef<string>("");

  useEffect(() => {
    if (!enabled) return;
    let raf = 0;
    let until = 0;

    const sample = () => {
      const el = card();
      const anchorEl = anchor();
      const r = el?.getBoundingClientRect();
      const anchorTop = anchorEl ? Math.round(anchorEl.getBoundingClientRect().top) : 0;
      const viewport = window.visualViewport;

      // Only distinct rows: sampling every frame otherwise buries the two or
      // three that matter in a hundred identical ones. The WHOLE sample is the
      // key, not just the boxes — a band that slides moves nothing in layout
      // coordinates, and that invisible-to-rects change is exactly the one that
      // cost five wrong fixes.
      const key = [
        Math.round(r?.top ?? 0),
        Math.round(r?.height ?? 0),
        anchorTop,
        Math.round(viewport?.offsetTop ?? 0),
        Math.round(viewport?.height ?? 0),
        document.documentElement.clientHeight,
        Math.round(window.scrollY),
      ].join(":");

      if (key !== lastRef.current) {
        lastRef.current = key;
        setSamples((previous) =>
          [
            ...previous,
            {
              t: Math.round(performance.now() - originRef.current),
              top: Math.round(r?.top ?? 0),
              bottom: Math.round(r?.bottom ?? 0),
              height: Math.round(r?.height ?? 0),
              anchorTop,
              offsetTop: Math.round(viewport?.offsetTop ?? 0),
              bandHeight: Math.round(viewport?.height ?? 0),
              layout: document.documentElement.clientHeight,
              scrollY: Math.round(window.scrollY),
            },
          ].slice(-80)
        );
      }
      if (performance.now() < until) raf = requestAnimationFrame(sample);
    };

    // Sample for a while after anything happens, rather than continuously: the
    // interesting frames all follow an event, and the settle after them matters
    // as much as the event did.
    const kick = () => {
      const now = performance.now();
      if (originRef.current === 0 || now - until > WATCH_MS) originRef.current = now;
      until = now + WATCH_MS;
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(sample);
    };

    const viewport = window.visualViewport;
    // visualViewport for the keyboard, focus for what provokes it, pointerdown
    // for a close (which is neither), window scroll for the reveal.
    viewport?.addEventListener("resize", kick);
    viewport?.addEventListener("scroll", kick);
    window.addEventListener("focusin", kick);
    window.addEventListener("focusout", kick);
    window.addEventListener("pointerdown", kick);
    window.addEventListener("scroll", kick);
    kick();

    return () => {
      cancelAnimationFrame(raf);
      viewport?.removeEventListener("resize", kick);
      viewport?.removeEventListener("scroll", kick);
      window.removeEventListener("focusin", kick);
      window.removeEventListener("focusout", kick);
      window.removeEventListener("pointerdown", kick);
      window.removeEventListener("scroll", kick);
    };
  }, [card, anchor, enabled]);

  return { samples, clear: () => setSamples([]) };
}
