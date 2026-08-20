"use client";

import { useRef, type ReactNode } from "react";
import { CloseIcon } from "@/components/Icon";
import { modalBackdropClass, useModalChrome } from "./useModalChrome";

// The dialog frame shared by the owner-edit modals (AddGameModal,
// EditGameModal, EditWishlistModal): backdrop, panel, header row with the close
// button, and the error line under the body.
//
// useModalChrome already extracted these dialogs' shared *behavior* (scroll
// lock, focus in/out, Escape). This is the other half — the markup — which was
// still written out once per modal, so the z-index contract with StatsPanel and
// the close button's focus wiring lived in three places.
//
// The hook is called here rather than by each caller, so a new dialog gets the
// behavior by using the frame instead of by remembering to.
type ModalShellProps = {
  // aria-label for the dialog. Distinct from `title`, which is what the user
  // reads: the label can name the action ("Edit Hades II") where the visible
  // heading is just the game's name.
  label: string;
  title: ReactNode;
  // Optional second line under the title (system, wishlist date).
  subtitle?: ReactNode;
  onClose: () => void;
  // Rendered as a role="alert" line under the body. null = no error showing.
  error: string | null;
  // Extra classes for the panel. AddGameModal is the only dialog that needs
  // them: it is a capped-height flex column so its results list scrolls while
  // the search box and buttons stay put.
  panelClassName?: string;
  // When set, the header's close button does not take initial focus and this
  // element does instead (AddGameModal focuses its search input).
  initialFocusRef?: React.RefObject<HTMLElement | null>;
  children: ReactNode;
};

export function ModalShell({
  label,
  title,
  subtitle,
  onClose,
  error,
  panelClassName = "w-full max-w-sm",
  initialFocusRef,
  children,
}: ModalShellProps) {
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  // Default the focus target to the close button, which is what the two edit
  // dialogs want; a caller with a better first stop passes its own ref.
  useModalChrome(onClose, initialFocusRef ?? closeButtonRef);

  return (
    // z-50: above StatsPanel's backdrop/panel (z-30/z-40 range).
    //
    // Height stays inset-0 rather than measured from visualViewport: that was
    // tried and reverted, because a pixel height goes stale between viewport
    // events and the panel then centers in a stale, taller box. Mobile browsers
    // already shrink the layout viewport for the keyboard. The backdrop below
    // is the one part that reaches past it, so the panel keeps centering in the
    // area that is visible whether or not the URL bar is showing.
    //
    // p-3 on a phone, where the gutter competes with the keyboard for pixels.
    <div className="fixed inset-0 z-50 grid place-items-center p-3 sm:p-4">
      {/* Backdrop — clicking it closes the dialog */}
      <div aria-hidden="true" onClick={onClose} className={`absolute ${modalBackdropClass}`} />

      {/* min-w-0 is load-bearing: a grid item's automatic minimum size is
          min-content, so without it the centering track cannot go narrower than
          the search results' untruncated nowrap lines, and the panel's right
          edge overflowed off screen on a phone. */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label={label}
        className={`relative min-w-0 rounded-lg border border-shelf-plank bg-shelf-bg p-4 sm:p-5 shadow-2xl ${panelClassName}`}
      >
        {/* shrink-0 matters only for the flex-column panel, where the header
            must not compress as the scrolling middle section grows. It is inert
            in the default block panel. */}
        <div className="flex shrink-0 items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-shelf-text font-semibold leading-snug">{title}</h2>
            {subtitle !== undefined && (
              <p className="text-shelf-text-muted text-xs mt-0.5">{subtitle}</p>
            )}
          </div>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="shrink-0 rounded-md p-1 text-shelf-text-muted hover:text-shelf-text hover:bg-shelf-input transition-colors cursor-pointer"
          >
            <CloseIcon className="w-5 h-5" aria-hidden />
          </button>
        </div>

        {children}

        {error && (
          <p role="alert" className="mt-3 shrink-0 text-xs text-red-500 dark:text-red-400">
            {error}
          </p>
        )}
      </div>
    </div>
  );
}
