/** A play session: one stretch of time you spent with a game. Mirrors
 *  `PlaySessionRead` (api/app/schemas/users.py).
 *
 *  Not in games.ts because `Game` carries the play state DERIVED from these
 *  rows, while these are the rows themselves, fetched separately. */
export type PlaySession = {
  id: number;
  // Which library entry this session belongs to: Game["id"], not the IGDB id.
  gameId: number;
  startDate: string; // ISO YYYY-MM-DD, always set
  // null while open, which is what makes the game currently playing. Not ""
  // like Game's optional strings: an open session is a state, not a gap.
  endDate: string | null;
};

/** Group a library's sessions by game, keeping the API's newest-first order.
 *  One fetch then serves both histories, the way pipeline.ts narrows the games
 *  array rather than asking the API for a subset. */
export function sessionsByGame(sessions: PlaySession[]): Map<number, PlaySession[]> {
  const grouped = new Map<number, PlaySession[]>();
  for (const session of sessions) {
    const existing = grouped.get(session.gameId);
    if (existing) existing.push(session);
    else grouped.set(session.gameId, [session]);
  }
  return grouped;
}

/** The sessions whose game is still in the library.
 *
 *  Games and sessions are separately cached, so a client can hold sessions for
 *  a game it no longer lists. Every surface filters through here, so a count
 *  and the list beside it cannot disagree. */
export function sessionsInLibrary(sessions: PlaySession[], gameIds: Set<number>): PlaySession[] {
  return sessions.filter((session) => gameIds.has(session.gameId));
}

// UTC: a bare YYYY-MM-DD parsed as local time shifts a day backwards west of
// Greenwich.
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

/** "Jul 2 – Jul 19, 2026", "Jul 2, 2026" for a single day, or "Since Jul 2,
 *  2026" while open. The year repeats only when the ends differ, so a session
 *  spanning New Year still reads unambiguously. */
export function formatSessionRange(session: PlaySession): string {
  const startYear = session.startDate.slice(0, 4);
  if (session.endDate === null) return `Since ${formatDay(session.startDate, true)}`;
  if (session.endDate === session.startDate) return formatDay(session.startDate, true);
  const sameYear = session.endDate.slice(0, 4) === startYear;
  return `${formatDay(session.startDate, !sameYear)} – ${formatDay(session.endDate, true)}`;
}

/** Days covered, counting both ends (a one-day session is 1), or null while
 *  the session is open. */
export function sessionLengthDays(session: PlaySession): number | null {
  if (session.endDate === null) return null;
  const ms = parseIso(session.endDate).getTime() - parseIso(session.startDate).getTime();
  return Math.round(ms / 86_400_000) + 1;
}
