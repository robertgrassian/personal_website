"use client";

// The library header's viewer-controls cluster, collapsed behind one button.
//
// These links used to sit in a row beside the heading. That row grew to four
// (Back to my library, Suggestion/Issue?, Account, Sign in/out) and on a phone
// it wrapped into its own two-line strip above the title, before any of the
// library was visible. A menu holds the same set in fixed space and absorbs the
// next one for free.
//
// It is a disclosure, not an ARIA `menu`: no role="menu", no arrow-key roving
// tabindex. The contents are ordinary links and a button, so Tab already walks
// them in order, and the WAI pattern for site navigation is a button with
// aria-expanded revealing a group. role="menu" would promise keyboard behavior
// this does not implement.
//
// The items arrive as `children` rather than being listed here, so LibraryPage
// stays the one place that says what is in the header. A client component may
// receive server-rendered children: they render on the server and arrive as an
// already-rendered tree, so passing them through this does not turn them into
// client-side JavaScript.

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { CloseIcon, MenuIcon } from "@/components/Icon";

export function LibraryHeaderMenu({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  // useId gives a server/client-stable id, which a counter or Math.random would
  // not: React 19 hydration compares them.
  const panelId = useId();

  useEffect(() => {
    if (!open) return;

    function handlePointerDown(event: PointerEvent) {
      // The toggle button is inside the wrapper too, so its own click never
      // reaches this as an "outside" press and cannot close-then-reopen.
      if (!wrapperRef.current?.contains(event.target as Node)) setOpen(false);
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      setOpen(false);
      // Escape can be pressed while focus sits on a menu item, which is about
      // to be unmounted. Without this, focus falls back to <body> and the next
      // Tab restarts from the top of the page.
      buttonRef.current?.focus();
    }

    // pointerdown, not click: a press that starts outside should dismiss even
    // if the pointer is released elsewhere.
    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  return (
    <div
      ref={wrapperRef}
      // Positioned ancestor for the panel below.
      className="relative"
      // React's onBlur is focusout, so it bubbles from the items: tabbing past
      // the last one closes the menu. Guarded on relatedTarget being a real
      // node, because focus moving to nothing (a click on non-focusable
      // padding) is already the pointerdown handler's job.
      onBlur={(event) => {
        if (
          event.relatedTarget instanceof Node &&
          !event.currentTarget.contains(event.relatedTarget)
        ) {
          setOpen(false);
        }
      }}
    >
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((isOpen) => !isOpen)}
        aria-expanded={open}
        // Only while the panel exists: aria-controls pointing at an absent id
        // is a broken reference to a screen reader.
        aria-controls={open ? panelId : undefined}
        aria-label={open ? "Close menu" : "Open menu"}
        // -mr-2 pulls the icon's padding back over the page gutter so the glyph
        // itself lines up with the content edge, while the tap target keeps its
        // full 40px.
        className="-mr-2 cursor-pointer rounded-md p-2 text-shelf-text-muted transition-colors duration-150 hover:text-link"
      >
        {open ? (
          <CloseIcon className="h-5 w-5" aria-hidden />
        ) : (
          <MenuIcon className="h-5 w-5" aria-hidden />
        )}
      </button>

      {open && (
        <div
          id={panelId}
          // Dismiss on activation, by delegation: the items are opaque children,
          // so this cannot hook their handlers individually. closest() keeps it
          // to real activations, so a click on the panel's own padding does not
          // count as picking something.
          onClick={(event) => {
            if ((event.target as HTMLElement).closest("a, button")) setOpen(false);
          }}
          // right-0 so the panel hangs inward from the button rather than off
          // the right edge of a phone.
          //
          // bg-shelf-bg, not bg-shelf-input: the input token is a translucent
          // white in dark mode, and shelf covers would show through it.
          //
          // z-30 clears the sticky shelf header (z-20), which would otherwise
          // ride up over an open menu on scroll. It stays under the slide-in
          // panels (z-40) and the nav (z-50), per the contract in ModalFrame.
          className="absolute right-0 top-full z-30 mt-2 flex w-max min-w-44 flex-col rounded-lg border border-shelf-input-border bg-shelf-bg p-1.5 shadow-lg"
        >
          {children}
        </div>
      )}
    </div>
  );
}
