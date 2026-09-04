"use client";

import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { columnsThatFit, splitIntoBoards, type Board } from "./boards";

// Cuts a group's games into one board per row. How many fit is a measurement
// only the browser can make, which is what makes the built-in theme a client
// component and the plain one not. The perspective is a constant per bay and
// lives in CSS.
export function useShelfBoards<T>(games: T[]): {
  caseRef: React.RefObject<HTMLDivElement | null>;
  boards: Board<T>[];
  columns: number;
} {
  const caseRef = useRef<HTMLDivElement>(null);
  // 0 means "not measured yet": one tall bay holding the whole group, which
  // the CSS lays out with auto-fill. The measurement below runs in a LAYOUT
  // effect, which commits before the browser paints, so that render is never
  // seen and re-cutting into boards is not a visible reflow.
  const [columns, setColumns] = useState(0);

  useLayoutEffect(() => {
    const caseEl = caseRef.current;
    if (caseEl === null) return;

    const sync = () => {
      const row = caseEl.querySelector<HTMLElement>(".shelf-row");
      if (row === null) return;
      const style = getComputedStyle(row);
      // getBoundingClientRect, not clientWidth: this number becomes the
      // grid's track count, and clientWidth rounds, so half a pixel of
      // rounding up claims a track that does not fit and overflows the shelf.
      const available =
        row.getBoundingClientRect().width -
        parseFloat(style.paddingLeft) -
        parseFloat(style.paddingRight);
      const fits = columnsThatFit({ available, gap: parseFloat(style.columnGap) || 0 });
      setColumns((current) => (current === fits ? current : fits));
    };

    sync();
    // Re-cut on any width change. This does feed itself -- the track count
    // changes the case's height -- but it converges: a ResizeObserver only
    // reports width changes here, and the width a given track count produces
    // does not depend on that count.
    const observer = new ResizeObserver(sync);
    observer.observe(caseEl);
    return () => observer.disconnect();
  }, []);

  const boards = useMemo(
    () => (columns === 0 ? [games] : splitIntoBoards(games, columns)),
    [games, columns]
  );

  // columns goes to the grid as its explicit track count, from the same state
  // that cut the boards: set imperatively it would land a frame early, putting
  // more covers on a board than the grid had tracks for and wrapping one onto a
  // second, floorless row.
  return { caseRef, boards, columns };
}
