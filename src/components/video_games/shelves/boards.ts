// Geometry for the built-in shelf, kept pure so it can be tested without a
// browser: everything here is arithmetic over widths the DOM measured.

/** The rendered width of one game case. Matches `w-24` on GameCase. */
export const CASE_WIDTH = 96;

type FitArgs = {
  /** Content width of the row. Fractional: see columnsThatFit. */
  available: number;
  /** The row's column gap, read from CSS so the stylesheet stays the source. */
  gap: number;
  caseWidth?: number;
};

// How many cases fit across one board: n covers span n widths plus the n - 1
// gaps between them. This is deliberately the same sum `repeat(auto-fill, 96px)`
// does, because the row hands the answer straight back to the grid as its track
// count -- and a count one higher than the grid would have chosen overflows the
// shelf rather than wrapping, which is why `available` must be the FRACTIONAL
// width. clientWidth rounds, and rounding up half a pixel is enough to claim a
// track that is not there.
//
// Never returns 0. A viewport too narrow for a single case still has to render
// that case, overflowing, rather than render an empty shelf.
export function columnsThatFit({ available, gap, caseWidth = CASE_WIDTH }: FitArgs): number {
  if (!Number.isFinite(available) || available <= 0) return 1;
  return Math.max(1, Math.floor((available + gap) / (caseWidth + gap)));
}

export type Board<T> = {
  games: T[];
  /** Only the first board of a group carries the group's name. */
  isFirst: boolean;
};

// One board per row of games, because a bookcase cannot hold three rows of
// games in one bay. An empty group still yields one board: the case has to
// have a shelf in it even when a filter has emptied the group.
export function splitIntoBoards<T>(games: T[], columns: number): Board<T>[] {
  const perBoard = Math.max(1, columns);
  if (games.length === 0) return [{ games: [], isFirst: true }];

  const boards: Board<T>[] = [];
  for (let i = 0; i < games.length; i += perBoard) {
    boards.push({ games: games.slice(i, i + perBoard), isFirst: i === 0 });
  }
  return boards;
}
