"use client";

import { type CSSProperties, type ReactNode, type RefObject } from "react";
import { useModalChrome } from "./useModalChrome";
import { ModalBackdrop } from "./ModalBackdrop";
import { useVisibleViewportInsets } from "./useVisibleViewportInsets";
import { ViewportDebugOverlay } from "./ViewportDebugOverlay";

// Everything a dialog needs AROUND its panel: scroll lock, focus in/out, Escape,
// the backdrop, and a centering frame that stays clear of the notch, the home
// indicator and the software keyboard. It renders no panel of its own, so a
// caller whose panel is not a centered flex column (the expanded game case,
// which is a 3D-transformed card) can reuse all of that without forking it.
//
// ModalShell is this plus the conventional panel, and is still what a plain
// dialog should use.
type ModalFrameProps = {
  onClose: () => void;
  // Passed to ModalBackdrop. Off for a panel that animates above it; see there.
  backdropBlur?: boolean;
  // Passed to ModalBackdrop: fade the dim in and out over this many ms rather
  // than cutting it on and off.
  backdropFadeMs?: number | null;
  // Passed to ModalBackdrop: run that fade in reverse.
  backdropFadingOut?: boolean;
  // Takes initial focus. Required rather than defaulted, because the element
  // worth focusing lives in the panel, which is the caller's.
  initialFocusRef: RefObject<HTMLElement | null>;
  children: ReactNode;
};

export function ModalFrame({
  onClose,
  initialFocusRef,
  backdropBlur = true,
  backdropFadeMs = null,
  backdropFadingOut = false,
  children,
}: ModalFrameProps) {
  useModalChrome(onClose, initialFocusRef);

  // How much of the frame the software keyboard has taken, which is padded
  // away below so the panel centers in what is left. Both are 0 without one.
  const hidden = useVisibleViewportInsets("frame");

  return (
    // The z contract, which now spans three files: backdrop z-30 under the two
    // stays-mounted panels (z-40), backdrop z-50 over the nav (z-50) for these
    // dialogs, frame z-[60] over that. The frame has to clear its own backdrop
    // because the backdrop is portalled to <body> and so paints after it at
    // equal z. pointer-events-none lets a tap on the empty
    // area reach that backdrop, since the frame now covers it rather than
    // containing it; the panel turns pointer events back on.
    //
    // This frame stays `fixed` even though the backdrop had to stop being
    // fixed. WebKit clipping a fixed layer to the stale layout viewport only
    // matters to something that has to reach the screen's edges, and this only
    // has to place the panel, which belongs inside the visible area anyway.
    //
    // Height stays inset-0, which is the layout viewport, and a software
    // keyboard does NOT shrink that: it shrinks the visual viewport and can
    // slide it down inside the layout one (useVisibleViewportInsets). So the
    // strips it hides are padded away instead, top and bottom, which leaves
    // this box's own insets free to keep meaning what they mean to iOS. An
    // earlier attempt sized the whole frame from visualViewport and was
    // reverted for going stale between events; the hook now listens for the
    // scroll events too, which is what was missing.
    //
    // max(), not a sum: a hidden strip and a safe area are the same pixels
    // twice, since the keyboard covers the home indicator it overlaps.
    //
    // Every side is set separately, and the gutter comes from --modal-gutter
    // rather than p-3/sm:p-4: a responsive shorthand sorts after the per-side
    // utilities and would silently drop the safe-area half of each calc.
    //
    // grid-rows-[minmax(0,1fr)] pins the row to this box's content height. The
    // default auto row grows with its item, so a panel sizing itself in % had
    // nothing definite to resolve against and could outgrow the frame.
    //
    // max-h-[100svh] is the browser's URL bar, not the keyboard. inset-0 spans
    // the LAYOUT viewport, and on iOS that stays at the large size when the URL
    // bar expands: the bar simply covers the bottom of a fixed element, so a
    // panel sized to fill the frame had its last control hidden behind it and
    // had to be scrolled to. svh is the SMALL viewport, the one with the
    // browser UI shown, so sizing against it reserves that space whether the
    // bar is up or not and the panel stops changing size as it comes and goes.
    // Browsers without svh ignore this and behave as before.
    //
    // The padding transition is what makes getting out of the keyboard's way
    // read as the dialog tracking it rather than teleporting. It animates only
    // when a keyboard is involved: --safe-* never changes, so on desktop and on
    // a phone with no keyboard there is nothing here to transition.
    <div
      className="pointer-events-none fixed inset-0 z-[60] max-h-[100svh] grid grid-rows-[minmax(0,1fr)] place-items-center pt-[calc(var(--modal-gutter)+max(var(--safe-top),var(--hidden-top,0px)))] pr-[calc(var(--modal-gutter)+var(--safe-right))] pb-[calc(var(--modal-gutter)+max(var(--safe-bottom),var(--hidden-bottom,0px)))] pl-[calc(var(--modal-gutter)+var(--safe-left))] transition-[padding] duration-200 ease-out motion-reduce:transition-none"
      style={
        {
          "--hidden-top": `${hidden.top}px`,
          "--hidden-bottom": `${hidden.bottom}px`,
        } as CSSProperties
      }
    >
      {/* Backdrop — clicking it closes the dialog */}
      <ModalBackdrop
        onClose={onClose}
        className="z-50"
        blur={backdropBlur}
        fadeMs={backdropFadeMs}
        fadingOut={backdropFadingOut}
      />

      {children}

      {/* Renders only under ?vvdebug=1. Temporary; see viewportDebug.ts. */}
      <ViewportDebugOverlay />
    </div>
  );
}
