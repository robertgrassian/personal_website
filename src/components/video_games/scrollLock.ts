// Holding the page still while a dialog is open, in two stages, and the two
// functions anything that still needs to scroll it must use instead of
// `window`.
//
// STAGE ONE, on open: `overflow: hidden`, plus a touchmove guard. The overflow
// leaves the document's scroll range intact, which matters more than it sounds.
// Safari keeps its URL bar collapsed to a pill only while the page is
// scrollable and scrolled, so a page that cannot scroll gets the full bar back
// -- every dialog opening would grow the browser chrome and shrink the screen.
//
// Keeping that range is also why the overflow alone does not hold: WebKit still
// pans a document that has one, so the shelves scrolled behind an open card and
// under a card flying home, which landed on a case that had moved. The guard
// cancels the touch instead, and only for gestures the dialog is not scrolling
// itself.
//
// STAGE TWO, on a field taking focus: the body comes out of flow. This is what
// `overflow: hidden` cannot do. Focusing a field inside a dialog makes WebKit
// scroll the document to "reveal" it -- 206px, measured -- and the field is
// inside a `position: fixed` element, so that scroll reveals nothing at all.
// What it moves is the page behind the dialog, which rises and STAYS risen,
// leaving the shelf case a card flies back to somewhere other than where it was
// clicked. Taking the document out of flow removes the scroll range that reveal
// needs; the negative `top` keeps the page looking unmoved while it is out of
// it. docs/mobile-viewport.md has the captures and the rejected alternatives.
//
// Splitting the two is what keeps the pill: by the time stage two runs, a
// keyboard is arriving over the bottom of the screen anyway.
//
// While out of flow the page has no scroll range, so `window.scrollY` reads 0
// and `window.scrollTo` does nothing. Scrolling it means moving `top`, which is
// what `scrollPageTo` is for.

/** One element on the path from a touch target out to the body, as the decision
 *  below needs to see it. Split from the DOM walk so `npm test` can replay a
 *  chain without a browser. */
export type ScrollBox = {
  overflowY: string;
  scrollHeight: number;
  clientHeight: number;
};

/** Whether a touch starting here belongs to a scroller inside the dialog rather
 *  than to the page behind it.
 *
 *  A region has to be able to scroll RIGHT NOW to count: an `overflow-y: auto`
 *  box with nothing to scroll hands the gesture straight on to the page, which
 *  is the thing being held still. Scrollers that can run out mid-gesture are
 *  covered by `overscroll-behavior: contain` on the scroller itself, since by
 *  then the browser owns the gesture and no listener can take it back. */
export function handlesOwnScroll(chain: Iterable<ScrollBox>): boolean {
  for (const box of chain) {
    if (box.overflowY !== "auto" && box.overflowY !== "scroll") continue;
    if (box.scrollHeight > box.clientHeight) return true;
  }
  return false;
}

/** The chain above, read lazily off the DOM: a generator so the walk stops at
 *  the first scroller rather than paying for getComputedStyle on every
 *  ancestor of every touch. */
function* boxesFrom(target: EventTarget | null): Generator<ScrollBox> {
  let el = target instanceof Element ? target : null;
  while (el !== null && el !== document.body && el !== document.documentElement) {
    yield {
      overflowY: getComputedStyle(el).overflowY,
      scrollHeight: el.scrollHeight,
      clientHeight: el.clientHeight,
    };
    el = el.parentElement;
  }
}

// Decided once per gesture, at touchstart: a finger that started inside a
// scroller keeps that answer even after the scroller runs out, which is how
// touch scrolling already behaves.
let touchScrolls = false;

const onTouchStart = (e: TouchEvent) => {
  // Two fingers is a pinch, and zooming has to keep working with a dialog open.
  touchScrolls = e.touches.length > 1 || handlesOwnScroll(boxesFrom(e.target));
};

const onTouchMove = (e: TouchEvent) => {
  // Not cancelable means the browser has already committed the gesture to a
  // scroller (or the listener lost the race to a passive one); preventDefault
  // would only warn.
  if (touchScrolls || !e.cancelable) return;
  e.preventDefault();
};

// Capture, so a stopPropagation between the target and the document cannot hide
// the start of a gesture and leave the previous answer standing. touchmove is
// explicitly non-passive: the default for a document-level listener is passive,
// where preventDefault does nothing at all.
const TOUCH_START_OPTIONS: AddEventListenerOptions = { capture: true, passive: true };
const TOUCH_MOVE_OPTIONS: AddEventListenerOptions = { capture: true, passive: false };

let depth = 0;
let outOfFlow = false;
let lockedScrollY = 0;
let previousBodyStyle = "";

/** Whether stage two is in effect, which is to say the document has no scroll
 *  range of its own right now. Anything measuring that range has to wait. */
export function pageOutOfFlow(): boolean {
  return outOfFlow;
}

/** Where the page is scrolled to, in either stage. */
export function pageScrollY(): number {
  return outOfFlow ? lockedScrollY : window.scrollY;
}

/** Scroll the page, in either stage. Instant in both cases. */
export function scrollPageTo(y: number): void {
  if (outOfFlow) {
    lockedScrollY = y;
    document.body.style.top = `-${y}px`;
    return;
  }
  window.scrollTo(0, y);
}

/** Stage two. Call once a field inside the dialog has taken focus AND the tap
 *  that focused it has finished, never before: this is the half that costs
 *  Safari its collapsed URL bar, and it re-lays out the document, which a tap in
 *  progress does not survive. */
export function preventRevealScroll(): void {
  if (depth === 0 || outOfFlow) return;
  outOfFlow = true;

  const body = document.body;
  // lockedScrollY is whatever stage one recorded, NOT a fresh reading. Stage two
  // runs a moment after the field is focused, and WebKit's reveal scroll may
  // already have happened in that gap; going out of flow at the remembered
  // position undoes it instead of freezing the page where the reveal left it.
  body.style.position = "fixed";
  body.style.top = `-${lockedScrollY}px`;
  body.style.left = "0";
  body.style.right = "0";
  body.style.width = "100%";
  // In the same tick: until the document lays out again it is still scrolled,
  // and the negative `top` above counts a second time. This is what removed a
  // frame of whole-page displacement in Firefox. Safari reports a scroll it has
  // not yet applied to layout, so its one frame survives this; see the doc.
  window.scrollTo(0, 0);
}

/** Lock the page until the returned function is called. */
export function lockScroll(): () => void {
  // Depth counted in module state rather than in the first caller's closure:
  // the surfaces that lock are not released in the order they were taken.
  // StatsPanel and FilterSheet both stay mounted and lock by flipping their
  // `enabled` flag, so an outer one can release while an inner dialog is still
  // open. Acting only on the transitions to and from 0 makes any order safe.
  depth += 1;
  if (depth === 1) {
    previousBodyStyle = document.body.style.cssText;
    // Recorded now, while the page is still where the user left it, because
    // stage two needs a position from before anything could have moved it.
    lockedScrollY = window.scrollY;
    document.body.style.overflow = "hidden";
    // False rather than left as it was: a finger already down when the dialog
    // opened got no touchstart under these listeners, and the gesture it is
    // part of belongs to the page.
    touchScrolls = false;
    document.addEventListener("touchstart", onTouchStart, TOUCH_START_OPTIONS);
    document.addEventListener("touchmove", onTouchMove, TOUCH_MOVE_OPTIONS);
  }

  return () => {
    depth -= 1;
    if (depth > 0) return;
    const wasOutOfFlow = outOfFlow;
    outOfFlow = false;
    document.removeEventListener("touchstart", onTouchStart, TOUCH_START_OPTIONS);
    document.removeEventListener("touchmove", onTouchMove, TOUCH_MOVE_OPTIONS);
    // cssText, not six assignments: it restores exactly what was there,
    // including nothing, rather than a hardcoded default.
    document.body.style.cssText = previousBodyStyle;
    // Only if stage two ran: the browser forgot the scroll position while the
    // body was out of flow, so it is put back by hand — at whatever
    // scrollPageTo last set, not at the position the lock was taken with.
    // Instant: a smooth scroll here would animate the page under a dialog that
    // has already gone.
    if (wasOutOfFlow) window.scrollTo(0, lockedScrollY);
  };
}
