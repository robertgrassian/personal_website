import { useEffect, useRef, type RefObject } from "react";

// The dimming/blurring layer behind a modal surface, shared by the five that
// use this hook. Callers add only z-index and transitions.
//
// The 25vh bleed covers a strip at the bottom of the screen this used to leave
// undimmed on iOS 26, roughly 60px of it, once the page had been scrolled.
//
// Scrolling there does not remove the URL bar, it shrinks it to a floating
// pill, and the layout viewport stays sized for the expanded bar. So
// `position: fixed` anchors to a box shorter than what is on screen, while
// ordinary in-flow content reaches the bottom edge perfectly well: the strip
// showed the page's own game covers, unblurred, below a backdrop that had
// stopped. Apple has this filed as bottom-anchored elements stopping "at the
// height where the toolbar was located".
//
// Hence an overshoot rather than a length, since no unit names that box: 25vh
// is far more than any browser chrome, on both edges because the bar can be
// top or bottom. The excess sits off screen or behind that chrome, and a fixed
// box adds no scrollable overflow, so over-covering is free.
export const modalBackdropClass =
  "fixed inset-x-0 top-[-25vh] bottom-[-25vh] bg-black/40 backdrop-blur-sm";

// Shared chrome for the owner dialogs. Locks body scroll, moves focus into the
// dialog (to initialFocusRef), closes on Escape, and restores focus to whatever
// opened it when it closes.
//
// Two lifecycles, one hook. The mount-only dialogs (AddGameModal,
// EditGameModal, EditWishlistModal) render only while open, so they leave
// `enabled` at its default and the effects run on mount and clean up on unmount
// — no isOpen plumbing. StatsPanel cannot work that way: it slide-animates in
// via `translate-x-full` and so stays mounted while closed, which is why it
// passes `enabled={isOpen}` and the effect body bails when false.
//
// Generic over the focus target's element type so callers can pass a
// `useRef<HTMLButtonElement>`/`useRef<HTMLInputElement>` without a variance
// cast.
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

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    // Remember what opened the dialog so focus can return to it on close
    // instead of dropping to <body>.
    const previouslyFocused = document.activeElement;
    initialFocusRef.current?.focus();

    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCloseRef.current();
    };
    window.addEventListener("keydown", handleKey);
    return () => {
      document.body.style.overflow = previousOverflow;
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
