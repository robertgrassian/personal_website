import { useEffect, useRef, type RefObject } from "react";

// Shared chrome for the owner dialogs. Locks body scroll, moves focus into the
// dialog (to initialFocusRef), closes on Escape, and restores focus to whatever
// opened it when it closes.
//
// Two lifecycles, one hook. The mount-only dialogs (AddGameModal,
// the detail card, AddGameModal) render only while open, so they leave
// `enabled` at its default and the effects run on mount and clean up on unmount
// — no isOpen plumbing. StatsPanel cannot work that way: it slide-animates in
// via `translate-x-full` and so stays mounted while closed, which is why it
// passes `enabled={isOpen}` and the effect body bails when false.
//
// Generic over the focus target's element type so callers can pass a
// `useRef<HTMLButtonElement>`/`useRef<HTMLInputElement>` without a variance
// cast.

let depth = 0;

// Hold the page still for as long as a dialog is open, and put it back
// afterwards.
//
// `overflow: hidden` stops a finger, not iOS. Focusing a field inside the
// dialog makes WebKit scroll the document to "reveal" it -- 206px, measured --
// and the field is inside a `position: fixed` element, so that scroll reveals
// nothing at all. What it moves is the library behind the dialog, which rises
// and STAYS risen, leaving the shelf case the card flies back to somewhere
// other than where it was clicked. Taking the document out of flow removes the
// scroll range that reveal needs, so there is nothing for it to scroll, and the
// negative `top` is what keeps the page looking unmoved while it is out of it.
//
// The gentler version -- keep the document in flow and put back any scroll it
// takes -- was tried and reverted. It cannot see the scroll it needs to undo:
// Safari and Chrome answer a focused field by SLIDING the visual viewport
// (offsetTop 209 and 203, layout viewport untouched) and then convert that
// slide into a real document scroll when the keyboard leaves, which arrives as
// a visualViewport event and never as a window `scroll`. The library ended up
// 209px high for good and the card landed on a case that was no longer there.
//
// Known residue: Safari renders ONE frame of the page displaced by the scroll
// position at dialog open, because it reports a scroll it has not yet applied
// to layout, so `top` and the document's own offset both count for that frame.
// `scrollY` already reads 0 there, which is why scrolling to 0 first (below)
// fixes Firefox and cannot fix Safari. One frame, against a permanently
// displaced library: the trade goes this way round.
function lockScroll(): () => void {
  // Depth, not a plain lock: two dialogs can overlap (the stats panel stays
  // mounted while other things open over it), and the inner one must not
  // re-read a scroll position of 0 from an already-fixed body and then restore
  // the page to the top when it closes. Only the outermost lock touches the
  // body at all.
  depth += 1;
  if (depth > 1) {
    return () => {
      depth -= 1;
    };
  }

  const body = document.body;
  const scrollY = window.scrollY;
  const previous = body.style.cssText;

  body.style.position = "fixed";
  body.style.top = `-${scrollY}px`;
  body.style.left = "0";
  body.style.right = "0";
  body.style.width = "100%";
  body.style.overflow = "hidden";
  // In the same tick: until the document lays out again it is still scrolled,
  // and the negative `top` above counts a second time. This is what removed
  // that frame in Firefox.
  window.scrollTo(0, 0);

  return () => {
    depth -= 1;
    // cssText, not six assignments: it restores exactly what was there,
    // including nothing, rather than a hardcoded default.
    body.style.cssText = previous;
    // The browser forgot the scroll position while the body was out of flow, so
    // it has to be put back by hand. Instant: a smooth scroll here would
    // animate the page under a dialog that has already gone.
    window.scrollTo(0, scrollY);
  };
}

export function useModalChrome<T extends HTMLElement>(
  onClose: () => void,
  initialFocusRef: RefObject<T | null>,
  enabled = true
): void {
  // Latest-ref pattern: the Escape listener reads onClose through a ref so the
  // mount effect below never needs onClose in its deps (and never re-runs).
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });

  useEffect(() => {
    if (!enabled) return;

    const unlockScroll = lockScroll();
    // Remember what opened the dialog so focus can return to it on close
    // instead of dropping to <body>.
    const previouslyFocused = document.activeElement;
    initialFocusRef.current?.focus();

    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCloseRef.current();
    };
    window.addEventListener("keydown", handleKey);
    return () => {
      unlockScroll();
      window.removeEventListener("keydown", handleKey);
      // isConnected guards against the opener having been unmounted (e.g. the
      // game moved shelves after a rating change re-rendered the grid).
      if (previouslyFocused instanceof HTMLElement && previouslyFocused.isConnected) {
        previouslyFocused.focus();
      }
    };
    // initialFocusRef is a stable ref object, so for a mount-only dialog this
    // runs once on mount. For a stays-mounted one it re-runs when `enabled`
    // flips, which is what makes open/close behave like mount/unmount.
  }, [initialFocusRef, enabled]);
}
