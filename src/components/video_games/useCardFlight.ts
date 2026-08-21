"use client";

import { useCallback, useLayoutEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import type { CardOrigin } from "./LibraryCardContext";

// The two levers for how the flight feels. Slow enough that the case reads as
// a case — you should have time to see the cover, the spine and the turn —
// rather than as a panel that appeared.
export const DURATION_MS = 660;

// The travel and the turn get DIFFERENT curves, on purpose. They still run for
// the same duration off the same clock, so they start and finish together.
//
// Travel: a normal ease-out. The curve this replaced was 98.5% complete at 75%
// of the way through, so the last ~200ms moved almost nothing, which read as
// dragging at the end and as stutter both, since near-zero motion spread over
// many frames is sub-pixel steps.
const EASING_TRAVEL = "cubic-bezier(0.25, 0.1, 0.55, 1)";

// Turn: slow through the middle. rotateY collapses the projected width toward
// zero as it approaches 90 degrees, so the visual change per degree is at its
// maximum exactly where the spine is — on one shared ease-out curve the case
// snapped from angled-one-way to angled-the-other with barely any edge-on
// frames. Measured over the flight, the shared curve held within 20 degrees of
// edge-on for 99ms and was already past 116 degrees at the halfway point; this
// one is symmetric (90 degrees at 50%) and holds for 196ms.
const EASING_TURN = "cubic-bezier(0.25, 0.45, 0.75, 0.55)";

export type FlightPhase = "flight" | "rest";

type UseCardFlightArgs = {
  // Where the case was when it was clicked. null means there is nothing to fly
  // from (a promote, or a card that swapped subject in place), so the card
  // fades in centered instead.
  origin: CardOrigin | null;
  // The source case, for hiding it while the card is out and re-measuring it
  // on the way back. null when the card has no case behind it.
  caseId: string | null;
  // Called once the return flight has landed, to unmount the card.
  onClosed: () => void;
};

function prefersReducedMotion(): boolean {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

// Holds a frame request open for as long as the flight runs, doing nothing
// with it.
//
// This looks pointless and is not. The flight is a compositor animation, so the
// main thread has no per-frame work and can go idle; Gecko in particular then
// stops driving frames at the full rate, which shows up as the flight
// stuttering even though nothing is expensive.
//
// The evidence: an instrumented build sampled frame times with exactly this
// loop, and every card was smooth under it — including the control that
// changed nothing else. Taking the instrumentation out brought the stutter
// back. The loop was the one thing common to every smooth measurement.
//
// It costs one no-op callback per frame for the length of the flight, which is
// why it is acceptable as a fix rather than only as a probe. If a future
// browser makes it unnecessary, deleting it is safe: the animation itself does
// not depend on it.
function keepFramesFlowing(): () => void {
  let raf = requestAnimationFrame(function tick() {
    raf = requestAnimationFrame(tick);
  });
  return () => cancelAnimationFrame(raf);
}

function findCase(caseId: string | null): HTMLElement | null {
  if (caseId === null) return null;
  return document.querySelector<HTMLElement>(`[data-case-id="${CSS.escape(caseId)}"]`);
}

// Where the case VISUALLY is, which is the lifted inner element rather than the
// button carrying the id: a child's transform does not move its ancestor's box,
// so on a hovered case the button's rect sits 8px below the artwork. GameCase
// measures the inner one on the way out, so the way back has to match it or the
// card lands slightly low and snaps as it disappears.
function caseArtRect(source: HTMLElement): DOMRect {
  const inner = source.querySelector<HTMLElement>(".game-case-inner");
  return (inner ?? source).getBoundingClientRect();
}

// The inverse transform that puts `card` exactly where `rect` is. Scale comes
// from width alone: a card with real content is close enough to the case's 2:3
// that the height lands within a few px, and the case is hidden on the same
// frame so there is nothing to compare it against.
function invertTo(rect: CardOrigin, card: DOMRect): string {
  const scale = rect.width / card.width;
  const dx = rect.left - card.left;
  const dy = rect.top + rect.height / 2 - card.top - (card.height * scale) / 2;
  return `translate(${dx}px, ${dy}px) scale(${scale})`;
}

/** Flies the detail card out of its shelf case and back again.
 *
 *  FLIP on the real, full-size card: it is laid out at its final size, then
 *  transformed back onto the case and animated to identity. Nothing is ever
 *  rendered above 1x, so text is never a scaled-up blur, and there is only one
 *  content layout rather than a cross-fade between a small one and a big one.
 *
 *  Web Animations rather than CSS transitions, for three things transitions
 *  make awkward: two elements starting on the same frame with one shared curve,
 *  a callback at the end to drop out of 3D, and reversing a close from wherever
 *  the open had got to. */
export function useCardFlight({ origin, caseId, onClosed }: UseCardFlightArgs) {
  const flightRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  const [settled, setSettled] = useState(false);
  const [closing, setClosing] = useState(false);

  // 3D is on for both flights and off in between. `closing` re-enters it before
  // the effect below measures, which is why it is derived rather than stored.
  const phase: FlightPhase = settled && !closing ? "rest" : "flight";

  // Latest-ref so the close effect does not re-run when the caller re-renders.
  const onClosedRef = useRef(onClosed);
  onClosedRef.current = onClosed;

  // Read by the outbound completion below, which is mount-only and so cannot
  // see `closing` through its own closure.
  const closingRef = useRef(false);
  closingRef.current = closing;

  // Outbound. Runs once: the card mounts, gets inverted onto the case before
  // paint, then animates to where it already is.
  useLayoutEffect(() => {
    const card = flightRef.current;
    const inner = innerRef.current;

    if (card === null || inner === null || origin === null || prefersReducedMotion()) {
      setSettled(true);
      return;
    }

    // Measure the UNtransformed layout box. React re-invokes this effect in
    // development, and the previous run leaves its invert on the card:
    // measuring through that folds the case's position into the result, and the
    // invert collapses to identity — the card flips but never travels.
    card.style.transform = "";
    inner.style.transform = "";

    const invert = invertTo(origin, card.getBoundingClientRect());
    card.style.transform = invert;
    // The back face is what the user is meant to end up reading, so the
    // rotation runs front-to-back: 0 here, 180 at the end.
    inner.style.transform = "rotateY(0deg)";

    // forwards, not none. On finish, `none` drops the animated value and the
    // element snaps back to the inline transform set above — rotateY(0deg),
    // which is the FRONT face, at full size. That painted one frame of
    // unblurred cover art before React could commit the rest phase.
    const timing = { duration: DURATION_MS, fill: "forwards" as FillMode };
    const travel = card.animate([{ transform: invert }, { transform: "none" }], {
      ...timing,
      easing: EASING_TRAVEL,
    });
    const flip = inner.animate([{ transform: "rotateY(0deg)" }, { transform: "rotateY(180deg)" }], {
      ...timing,
      easing: EASING_TURN,
    });
    const stopKeepAlive = keepFramesFlowing();

    Promise.all([travel.finished, flip.finished])
      .then(() => {
        stopKeepAlive();
        // A close that began before this finished already owns these elements:
        // it has its own animations running on them and clears the inline
        // transforms when it lands. Settling here would stomp the underlying
        // value its animation reverts to when cancelled, which is the settle
        // flash all over again on a fast open-then-close.
        if (closingRef.current) return;
        // Commit the rest phase BEFORE releasing the fill, so the filled value
        // hands straight over to the CSS that replaces it with no frame in
        // between. At rest the inner drops its rotateY and so does the back
        // face, which cancel out, so the swap is pixel-identical.
        flushSync(() => setSettled(true));
        travel.cancel();
        flip.cancel();
        // Clear will-change last: de-promoting a layer whose faces carry
        // backface-visibility: hidden is a known one-frame flash in WebKit, and
        // this is the order that avoids paying for it twice.
        card.style.transform = "";
        inner.style.transform = "";
        card.style.willChange = "";
      })
      .catch(() => {
        // Cancelled by a close that arrived mid-flight; that path takes over.
      });

    return () => {
      stopKeepAlive();
      travel.cancel();
      flip.cancel();
      // Cancelling does not undo the inline transforms set above, and whatever
      // runs next has to measure a clean element.
      card.style.transform = "";
      inner.style.transform = "";
    };
    // Mount-only: `origin` is a snapshot of where the case was, and re-running
    // this on a re-render would restart the animation from a stale rect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The source case stays hidden for as long as the card is out, so the shelf
  // does not show a copy of what you are holding.
  //
  // Imperative rather than through React: a context or prop change would
  // re-render all ~155 memoized cases in the first frames of the animation,
  // which is the exact reconcile the memo exists to prevent, at the worst
  // possible moment.
  //
  // No dependency array, and the node is looked up again in the cleanup rather
  // than captured. Saving a rating can move the game to another shelf, which
  // destroys its case and builds a new one: a captured node would leave the
  // NEW case hidden forever, which showed up as a game-shaped hole on the shelf
  // that only a reload filled in.
  useLayoutEffect(() => {
    const source = findCase(caseId);
    if (source !== null) source.style.visibility = "hidden";
    return () => {
      const current = findCase(caseId);
      if (current !== null) current.style.visibility = "";
    };
  });

  // Inbound. Re-measures the case live rather than trusting `origin`: the page
  // can have scrolled, and the game can have moved to another shelf.
  useLayoutEffect(() => {
    if (!closing) return;
    const card = flightRef.current;
    const inner = innerRef.current;
    const source = findCase(caseId);

    const done = () => onClosedRef.current();

    if (card === null || inner === null || source === null || prefersReducedMotion()) {
      done();
      return;
    }

    const rect = caseArtRect(source);
    const offScreen =
      rect.width === 0 ||
      rect.bottom <= 0 ||
      rect.right <= 0 ||
      rect.top >= window.innerHeight ||
      rect.left >= window.innerWidth;
    if (offScreen) {
      done();
      return;
    }

    const invert = invertTo(rect, card.getBoundingClientRect());
    // This render put the card back into 3D with no transform, which is
    // rotateY(0) — the front face. It is showing the back, so pin it before the
    // browser paints.
    inner.style.transform = "rotateY(180deg)";

    const timing = { duration: DURATION_MS, fill: "forwards" as FillMode };
    const travel = card.animate([{ transform: "none" }, { transform: invert }], {
      ...timing,
      easing: EASING_TRAVEL,
    });
    const flip = inner.animate([{ transform: "rotateY(180deg)" }, { transform: "rotateY(0deg)" }], {
      ...timing,
      easing: EASING_TURN,
    });
    const stopKeepAlive = keepFramesFlowing();

    Promise.all([travel.finished, flip.finished])
      .then(() => {
        stopKeepAlive();
        done();
      })
      .catch(() => {});

    return () => {
      stopKeepAlive();
      travel.cancel();
      flip.cancel();
    };
  }, [closing, caseId]);

  const close = useCallback(() => setClosing(true), []);

  return { flightRef, innerRef, phase, close, closing };
}
