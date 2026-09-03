"use client";

import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { columnsThatFit, splitIntoBoards, type Board } from "./boards";

// Cuts a group's games into one board per row, and sizes the case's
// perspective. Both answers depend on measurements only the browser has, which
// is what makes the built-in theme a client component and the plain one not.
export function useShelfBoards<T>(games: T[]): {
  caseRef: React.RefObject<HTMLDivElement | null>;
  boards: Board<T>[];
} {
  const caseRef = useRef<HTMLDivElement>(null);
  // 0 means "not measured yet". The server has no viewport, so the first render
  // is one tall bay holding the whole group. The measurement below runs in a
  // LAYOUT effect, which commits before the browser paints, so re-cutting into
  // boards is not a visible reflow. What a slow connection can still show is
  // the server's one-bay layout in the moment before hydration runs — which is
  // the other shelf layout we considered, not a broken state.
  const [columns, setColumns] = useState(0);

  useLayoutEffect(() => {
    const caseEl = caseRef.current;
    if (caseEl === null) return;

    const sync = () => {
      const row = caseEl.querySelector<HTMLElement>(".shelf-row");
      if (row !== null) {
        const style = getComputedStyle(row);
        // getBoundingClientRect, not clientWidth: this number becomes the
        // grid's track count, and clientWidth rounds, so half a pixel of
        // rounding up claims a track that does not fit and overflows the shelf.
        const available =
          row.getBoundingClientRect().width -
          parseFloat(style.paddingLeft) -
          parseFloat(style.paddingRight);
        const fits = columnsThatFit({ available, gap: parseFloat(style.columnGap) || 0 });
        // Handed to the grid as an explicit track count. The board holds
        // exactly this many covers, so the two can never disagree about how
        // many fit, which is the only way a board can end up two rows tall.
        caseEl.style.setProperty("--shelf-cols", String(fits));
        setColumns((current) => (current === fits ? current : fits));
      }
      // The perspective distance is a multiple of THIS case's height, not a
      // constant. One vanishing point for a whole page means the distance from
      // eye level grows without bound: shelves at the origin flatten and the
      // ones at the far ends shear. It is barely visible on a short desktop
      // library and wrong on a phone, where three cases per row turns one
      // group into nine boards.
      caseEl.style.perspective = `${Math.max(2000, Math.round(caseEl.offsetHeight * 1.9))}px`;
    };

    sync();
    // Re-cut on any width change, and re-measure the height that the re-cut
    // itself produces. Setting `perspective` cannot change layout, so this does
    // not feed itself.
    const observer = new ResizeObserver(sync);
    observer.observe(caseEl);
    return () => observer.disconnect();
  }, []);

  const boards = useMemo(
    () => (columns === 0 ? [{ games, isFirst: true }] : splitIntoBoards(games, columns)),
    [games, columns]
  );

  return { caseRef, boards };
}
