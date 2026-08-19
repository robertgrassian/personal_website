import { useEffect, useRef, type RefObject } from "react";

// The dimming/blurring layer behind a modal surface, shared by the five that
// use this hook. Callers supply their own positioning (`absolute` inside
// ModalShell's fixed frame, `fixed` for the two stays-mounted panels), z-index
// and transition.
//
// min-h-lvh, not `inset-0` alone: a mobile browser's retracting URL bar grows
// the visual viewport without growing the layout viewport that `inset-0`
// resolves against, so the revealed strip stayed unblurred. `inset-0` remains
// as the fallback height where lvh is unsupported.
export const modalBackdropClass = "inset-0 min-h-lvh bg-black/40 backdrop-blur-sm";

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
