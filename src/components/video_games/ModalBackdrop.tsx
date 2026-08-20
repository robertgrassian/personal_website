"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

// The dimming/blurring layer behind a modal surface, shared by the three
// components that render one: ModalShell (for the owner dialogs), StatsPanel
// and FilterSheet.
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
// space instead: absolute, at the document's origin, as tall as the document,
// which covers every pixel the page can reach.
//
// The tradeoff is that it scrolls with the page. Spanning the whole document
// means scrolling still leaves it covered, but rubber-band overscroll past
// either end can pull it off the edge, and the scroll lock that would prevent
// that is itself broken (docs/todo/modal-scroll-lock.md). Fixing the lock
// closes this; a fixed backdrop is not the answer, since that is what iOS
// clips.
type ModalBackdropProps = {
  onClose: () => void;
  // z-index plus any transition classes. The callers differ: the owner dialogs
  // mount only while open, the two panels stay mounted and fade.
  className?: string;
};

export function ModalBackdrop({ onClose, className = "" }: ModalBackdropProps) {
  // A portal needs a real DOM node, which does not exist while rendering on the
  // server, so this stays null through SSR and the first render.
  const [container, setContainer] = useState<HTMLElement | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => setContainer(document.body), []);

  // Layout, not passive: the element renders at h-full, which for a box
  // positioned against the initial containing block is one viewport tall at the
  // document's origin. On a page scrolled any distance that is entirely off
  // screen, so a passive effect would let a frame paint with no backdrop at
  // all. Falls back to useEffect where there is no DOM to lay out.
  const useMeasureEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

  useMeasureEffect(() => {
    const el = ref.current;
    if (!el) return;

    // body's own box height, not documentElement.scrollHeight. Out-of-flow
    // boxes never contribute to their parent's height, so this reading cannot
    // see this backdrop or any sibling one, whatever an engine decides about
    // counting absolute boxes in the viewport's scrollable overflow. Measuring
    // scrollHeight instead needs the element zeroed first and still reads the
    // stale height of every other mounted backdrop.
    const measure = () => {
      const documentHeight = Math.max(
        document.body.offsetHeight,
        document.documentElement.clientHeight
      );
      el.style.height = `${documentHeight}px`;
    };

    measure();
    window.addEventListener("resize", measure);

    // The page behind can change height while a surface is open: changing a
    // filter in FilterSheet adds or removes whole shelves.
    const observer = new ResizeObserver(measure);
    observer.observe(document.body);

    return () => {
      window.removeEventListener("resize", measure);
      observer.disconnect();
    };
  }, [container, useMeasureEffect]);

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
