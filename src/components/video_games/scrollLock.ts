// Holding the page still while a dialog is open, and the two functions anything
// that still needs to scroll it must use instead of `window`.
//
// `overflow: hidden` stops a finger, not iOS. Focusing a field inside a dialog
// makes WebKit scroll the document to "reveal" it — 206px, measured — and the
// field is inside a `position: fixed` element, so that scroll reveals nothing at
// all. What it moves is the page behind the dialog, which rises and STAYS risen,
// leaving the shelf case a card flies back to somewhere other than where it was
// clicked. Taking the document out of flow removes the scroll range that reveal
// needs; the negative `top` is what keeps the page looking unmoved while it is
// out of it. docs/mobile-viewport.md has the captures and the rejected
// alternatives.
//
// The cost is that the page has no scroll range left, so `window.scrollY` reads
// 0 and `window.scrollTo` does nothing until the dialog closes. Scrolling it
// means moving `top` instead, which is what `scrollPageTo` is for.

let depth = 0;
let lockedScrollY = 0;
let previousBodyStyle = "";

/** Where the page is scrolled to, locked or not. */
export function pageScrollY(): number {
  return depth > 0 ? lockedScrollY : window.scrollY;
}

/** Scroll the page, locked or not. Instant in both cases. */
export function scrollPageTo(y: number): void {
  if (depth > 0) {
    lockedScrollY = y;
    document.body.style.top = `-${y}px`;
    return;
  }
  window.scrollTo(0, y);
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
    const body = document.body;
    lockedScrollY = window.scrollY;
    previousBodyStyle = body.style.cssText;

    body.style.position = "fixed";
    body.style.top = `-${lockedScrollY}px`;
    body.style.left = "0";
    body.style.right = "0";
    body.style.width = "100%";
    body.style.overflow = "hidden";
    // In the same tick: until the document lays out again it is still scrolled,
    // and the negative `top` above counts a second time. This is what removed a
    // frame of whole-page displacement in Firefox. Safari reports a scroll it
    // has not yet applied to layout, so its one frame survives this; see the
    // doc.
    window.scrollTo(0, 0);
  }

  return () => {
    depth -= 1;
    if (depth > 0) return;
    // cssText, not six assignments: it restores exactly what was there,
    // including nothing, rather than a hardcoded default.
    document.body.style.cssText = previousBodyStyle;
    // The browser forgot the scroll position while the body was out of flow, so
    // it is put back by hand — at whatever scrollPageTo last set, not at the
    // position the lock was taken with. Instant: a smooth scroll here would
    // animate the page under a dialog that has already gone.
    window.scrollTo(0, lockedScrollY);
  };
}
