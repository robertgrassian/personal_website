"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

// The dimming/blurring layer behind a modal surface, shared by the five that
// use useModalChrome.
//
// Why this is not `position: fixed; inset: 0`, which is what every other site
// does and what this was for a long time: on iOS 26, scrolling shrinks the URL
// bar to a floating pill without growing the layout viewport, and WebKit clips
// fixed layers to that stale viewport. A fixed backdrop therefore stops about
// 60px above the bottom of the screen and leaves a strip of the page crisp and
// undimmed. Four attempts to describe a bigger fixed box all failed, including
// bleeding it 25vh past both edges and sizing it from visualViewport, because
// the clip does not care how large the box claims to be.
//
// Ordinary document content does paint in that strip. So this lives in document
// space instead: absolute, at the document's origin, as tall as the document.
// It scrolls with the page rather than staying put, which is invisible while a
// modal is open and covers every pixel the page can reach.
type ModalBackdropProps = {
  onClose: () => void;
  // z-index plus any transition classes. The three callers differ: the owner
  // dialogs mount only while open, the two panels stay mounted and fade.
  className?: string;
};

export function ModalBackdrop({ onClose, className = "" }: ModalBackdropProps) {
  // A portal needs a real DOM node, which does not exist while rendering on the
  // server, so this stays null through SSR and the first render.
  const [container, setContainer] = useState<HTMLElement | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => setContainer(document.body), []);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const measure = () => {
      // Zero-height first: unlike a fixed box, an absolute one counts toward
      // the document's scrollable overflow, so measuring with the old height
      // still applied would pin the document at that height and it could never
      // shrink. Both writes happen in one synchronous block, so nothing paints
      // at zero.
      el.style.height = "0px";
      el.style.height = `${document.documentElement.scrollHeight}px`;
    };

    measure();
    window.addEventListener("resize", measure);

    // The page behind can change height while a surface is open: changing a
    // filter in FilterSheet adds or removes whole shelves. measure() is a fixed
    // point, so the write it makes settles rather than feeding back.
    const observer = new ResizeObserver(measure);
    observer.observe(document.body);

    return () => {
      window.removeEventListener("resize", measure);
      observer.disconnect();
    };
  }, [container]);

  if (!container) return null;

  return createPortal(
    <div
      ref={ref}
      aria-hidden="true"
      onClick={onClose}
      // h-full is only the pre-measurement height, for the frame between mount
      // and the effect above; the inline height replaces it immediately.
      className={`absolute left-0 top-0 h-full w-full bg-black/40 backdrop-blur-sm ${className}`}
    />,
    container
  );
}
