"use client";

import { useRef, type ReactNode } from "react";
import { CloseIcon } from "@/components/Icon";
import { modalBackdropClass, useModalChrome } from "./useModalChrome";
import { useVisualViewportBox } from "./useVisualViewportBox";

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
  // Extra classes for the panel. Both defaults matter: the panel is a flex
  // column so the body below can be the one scrolling part, and max-h-full caps
  // it at the frame, which is the visible band rather than the whole screen.
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
  // Default the focus target to the close button, which is what the two edit
  // dialogs want; a caller with a better first stop passes its own ref.
  useModalChrome(onClose, initialFocusRef ?? closeButtonRef);

  // The frame is sized to what the user can see, not to the layout viewport
  // `inset-0` would give: with a software keyboard up those are different
  // boxes, and the difference is a dialog centered partly behind the keyboard
  // with the page showing through above it. See useVisualViewportBox.
  //
  // An earlier version of this measured the same way and was reverted for going
  // stale between viewport events; the hook now listens for the scroll events
  // as well as the resize ones, which is what was missing. `inset: 0` stays as
  // the pre-measurement and unsupported-browser fallback.
  const visible = useVisualViewportBox();

  return (
    // z-50: above StatsPanel's backdrop/panel (z-30/z-40 range).
    //
    // p-3 on a phone, where the gutter competes with the keyboard for pixels.
    <div
      className="fixed z-50 flex items-center justify-center p-3 sm:p-4"
      style={visible ?? { inset: 0 }}
    >
      {/* Backdrop — clicking it closes the dialog. Its own min-h-lvh still
          earns its place: it covers the strip a retracting URL bar reveals in
          the frame before the resize event lands. */}
      <div aria-hidden="true" onClick={onClose} className={`absolute ${modalBackdropClass}`} />

      {/* Centered with flex rather than `place-items-center`, so the panel's
          max-h-full has something definite to resolve against: an auto grid row
          is sized BY its item, so the percentage came back as the panel's own
          height and capped nothing.

          min-w-0 is load-bearing: a flex item's automatic minimum size is
          min-content, so without it the panel cannot go narrower than the
          search results' untruncated nowrap lines, and its right edge
          overflowed off screen on a phone. */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label={label}
        className={`relative min-w-0 rounded-lg border border-shelf-plank bg-shelf-bg p-4 sm:p-5 shadow-2xl ${panelClassName}`}
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
          // The one scrolling part of the dialog, so a form taller than the
          // visible band can be reached instead of overflowing the frame with
          // nothing to scroll. -mx-1/px-1 gives focus rings a pixel to sit in,
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
    </div>
  );
}
