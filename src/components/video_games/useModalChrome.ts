import { useEffect, useRef, type RefObject } from "react";

// The dimming/blurring layer behind a modal surface, shared by the five that
// use this hook. Callers add only z-index and transitions.
//
// What actually fixes the strip this used to leave uncovered on iOS is
// viewport-fit=cover in layout.tsx: without it the page is inset out of the
// device safe areas, so `inset-0` stops above the home indicator no matter
// how the box is sized. Sizing it with min-h-lvh was tried first and changed
// nothing on the device, which is what pointed away from the height.
//
// The 25vh bleed on top of that is a backstop for a browser whose layout
// viewport lags a retracting URL bar. The excess sits off screen or behind
// browser chrome, and a fixed box adds no scrollable overflow, so it is free.
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
