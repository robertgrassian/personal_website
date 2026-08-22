/** A play session: one stretch of time you spent with a game.
 *
 * Mirrors `PlaySessionRead` (api/app/schemas/users.py) field for field, same
 * contract as Game and WishlistGame — camelCase on the wire, no translation
 * layer.
 *
 * The type lives here rather than in games.ts because a session belongs to the
 * library but is not part of a Game: `Game` carries the DERIVED play state
 * (currentlyPlaying, lastPlayed, sessionCount) and these are the rows it was
 * derived from, fetched separately and on demand.
 */
export type PlaySession = {
  id: number;
  // Which library entry this session belongs to: Game["id"], not the IGDB id.
  gameId: number;
  startDate: string; // ISO YYYY-MM-DD, always set
  // null while the session is open, which is what makes the game currently
  // playing. Note this is null and not "" — unlike every optional string on
  // Game, where "" means unset. An open session is a state, not a gap.
  endDate: string | null;
};

/** Group a whole library's sessions by game, preserving the newest-first order
 *  the API returned them in.
 *
 *  One fetch serves both the across-games history and any per-game slice of it,
 *  the same way pipeline.ts narrows the games array in the browser rather than
 *  asking the API for a subset. */
export function sessionsByGame(sessions: PlaySession[]): Map<number, PlaySession[]> {
  const grouped = new Map<number, PlaySession[]>();
  for (const session of sessions) {
    const existing = grouped.get(session.gameId);
    if (existing) existing.push(session);
    else grouped.set(session.gameId, [session]);
  }
  return grouped;
}

// Parsed as UTC, like formatDate elsewhere: a bare YYYY-MM-DD parsed as local
// time shifts a day backwards west of Greenwich.
function parseIso(iso: string): Date {
  return new Date(iso + "T00:00:00Z");
}

function formatDay(iso: string, withYear: boolean): string {
  return parseIso(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    ...(withYear ? { year: "numeric" } : {}),
    timeZone: "UTC",
  });
}

/** A session as one line of text: "Jul 2 – Jul 19, 2026", "Jul 2, 2026" for a
 *  single day, or "Since Jul 2, 2026" while it is still open.
 *
 *  The year is printed once when both ends share it and on both ends when they
 *  do not, so a session spanning New Year still reads unambiguously. */
export function formatSessionRange(session: PlaySession): string {
  const startYear = session.startDate.slice(0, 4);
  if (session.endDate === null) return `Since ${formatDay(session.startDate, true)}`;
  if (session.endDate === session.startDate) return formatDay(session.startDate, true);
  const sameYear = session.endDate.slice(0, 4) === startYear;
  return `${formatDay(session.startDate, !sameYear)} – ${formatDay(session.endDate, true)}`;
}

/** How many days a session covers, counting both ends, or null while it is
 *  open. A one-day session is 1, not 0. */
export function sessionLengthDays(session: PlaySession): number | null {
  if (session.endDate === null) return null;
  const ms = parseIso(session.endDate).getTime() - parseIso(session.startDate).getTime();
  return Math.round(ms / 86_400_000) + 1;
}
