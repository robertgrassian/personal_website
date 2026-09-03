// Geometry for the built-in shelf, kept pure so it can be tested without a
// browser: everything here is arithmetic over widths the DOM measured.

/** The rendered width of one game case. Matches `w-24` on GameCase. */
export const CASE_WIDTH = 96;

// The tightest a shelf packs when deciding how many covers FIT. The space
// actually left between them is `evenGap` below, which is usually wider and, at
// the exact width where one more cover just squeezes in, a little narrower.
// shelf-themes.css repeats this number as the fallback for the one render that
// happens before anything has been measured.
export const MIN_GAP = 3;

type FitArgs = {
  /** Content width of the row, i.e. clientWidth minus its own padding. */
  available: number;
  caseWidth?: number;
};

// How many cases fit across one board. This is the same sum CSS grid's
// auto-fill does, done by hand because the boards are separate elements: a
// row of n cases spans n widths plus (n - 1) gaps.
//
// Never returns 0. A viewport too narrow for a single case still has to render
// that case, overflowing, rather than render an empty shelf.
export function columnsThatFit({ available, caseWidth = CASE_WIDTH }: FitArgs): number {
  if (!Number.isFinite(available) || available <= 0) return 1;
  return Math.max(1, Math.floor((available + MIN_GAP) / (caseWidth + MIN_GAP)));
}

export type Board<T> = {
  games: T[];
  /** Only the first board of a group carries the group's name. */
  isFirst: boolean;
};

// The space to leave between covers, and between the end covers and the
// uprights, so that all of it is equal. A row of n covers has n + 1 of these
// gaps: one between each neighbouring pair, and one at each end.
//
// It is derived rather than chosen, so it changes with the viewport: about
// 10px across a full desktop shelf, about 7px on a phone. That is the price of
// even spacing at a fixed cover width, and it is why the row centres its
// contents instead of padding itself -- a centred row puts exactly this much
// air at each end on its own.
export function evenGap({
  available,
  columns,
  caseWidth = CASE_WIDTH,
}: FitArgs & { columns: number }): number {
  if (columns < 1) return MIN_GAP;
  return Math.max(0, (available - columns * caseWidth) / (columns + 1));
}

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
