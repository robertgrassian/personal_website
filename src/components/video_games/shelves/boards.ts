// Geometry for the built-in shelf, kept pure so it can be tested without a
// browser: everything here is arithmetic over widths the DOM measured.

/** The rendered width of one game case. Matches `--case-w` in video-games.css. */
export const CASE_WIDTH = 96;

type FitArgs = {
  /** Content width of the row, i.e. clientWidth minus its own padding. */
  available: number;
  /** The row's column gap. */
  gap: number;
  caseWidth?: number;
};

// How many cases fit across one board. This is the same sum CSS grid's
// auto-fill does, done by hand because the boards are separate elements: a
// row of n cases spans n widths plus (n - 1) gaps.
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
  /** A row that did not fill leans its last case. A full row has nothing to lean into. */
  isShort: boolean;
};

// One board per row of games, because a bookcase cannot hold three rows of
// games in one bay. An empty group still yields one board: the case has to
// have a shelf in it even when a filter has emptied the group.
export function splitIntoBoards<T>(games: T[], columns: number): Board<T>[] {
  const perBoard = Math.max(1, columns);
  if (games.length === 0) return [{ games: [], isFirst: true, isShort: true }];

  const boards: Board<T>[] = [];
  for (let i = 0; i < games.length; i += perBoard) {
    const slice = games.slice(i, i + perBoard);
    boards.push({
      games: slice,
      isFirst: i === 0,
      isShort: slice.length < perBoard,
    });
  }
  return boards;
}
