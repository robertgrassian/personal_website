"use client";

import { useRef, type ReactNode } from "react";
import { CloseIcon } from "@/components/Icon";
import { ModalFrame } from "./ModalFrame";

// The conventional dialog panel: a centered flex column with a header row, one
// scrolling body and an error line, inside ModalFrame's backdrop and chrome.
//
// useModalChrome extracted these dialogs' shared *behavior* (scroll lock, focus
// in/out, Escape); this is the other half, the markup, which was still written
// out once per modal. ModalFrame now owns everything outside the panel, so a
// dialog whose panel is not this shape reuses the chrome without forking it.
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
  // Extra classes for the panel. Both defaults are load-bearing: the panel is a
  // flex column so the body below can be its one scrolling part, and max-h-full
  // caps it at the grid row, which is the frame's content box.
  panelClassName?: string;
  // False when the children are the flex column's own sections and scroll
  // themselves (AddGameModal). True wraps them in the scrolling body below.
  scrollBody?: boolean;
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
  panelClassName = "flex max-h-full w-full max-w-sm flex-col",
  scrollBody = true,
  initialFocusRef,
  children,
}: ModalShellProps) {
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  return (
    // Default the focus target to the close button, which is what the two edit
    // dialogs want; a caller with a better first stop passes its own ref.
    <ModalFrame onClose={onClose} initialFocusRef={initialFocusRef ?? closeButtonRef}>
      {/* min-w-0 is load-bearing: a grid item's automatic minimum size is
          min-content, so without it the centering track cannot go narrower than
          the search results' untruncated nowrap lines, and the panel's right
          edge overflowed off screen on a phone. */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label={label}
        className={`pointer-events-auto relative min-w-0 rounded-lg border border-shelf-plank bg-shelf-bg p-4 sm:p-5 shadow-2xl ${panelClassName}`}
      >
        {/* shrink-0 keeps the header at its natural height as the scrolling
            body below grows. */}
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

        {scrollBody ? (
          // The dialog's one scrolling part, so a form taller than the frame
          // can be reached instead of overflowing it with nothing to scroll.
          // That is routine on a phone with the keyboard up, where the frame is
          // the band above it. -mx-1/px-1 gives focus rings a pixel to sit in,
          // since a scroll container clips them; overflow-x-hidden is not
          // redundant, because one axis set to anything but `visible` computes
          // the other to `auto`. overscroll-contain keeps a flick at the end of
          // the form off the library behind it.
          <div className="-mx-1 min-h-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-contain px-1">
            {children}
          </div>
        ) : (
          children
        )}

        {error && (
          <p role="alert" className="mt-3 shrink-0 text-xs text-red-500 dark:text-red-400">
            {error}
          </p>
        )}
      </div>
    </ModalFrame>
  );
}
