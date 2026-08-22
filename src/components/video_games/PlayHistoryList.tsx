"use client";

import { useMemo } from "react";
import { systemLabel, type Game } from "@/lib/games";
import {
  formatSessionRange,
  sessionLengthDays,
  sessionsInLibrary,
  type PlaySession,
} from "@/lib/sessions";

type PlayHistoryListProps = {
  sessions: PlaySession[];
  // To put a name against each session's gameId. The whole array because the
  // caller has it and this is the only place that needs the lookup.
  games: Game[];
  isLoading: boolean;
  error: string | null;
  // Differs by surface: an owner is invited to start, a visitor is told there
  // is nothing here.
  emptyMessage: string;
};

// One session as a row: what was played, when, and for how long.
//
// The per-game view has its own row: it sits on the card's scrim, takes the
// shelf tokens, and never names the game. The shared part is the formatting, in
// lib/sessions.ts.
//
// Not a table: three values are one sentence, and a table would need a
// horizontal scroller inside a 560px panel.
function SessionRow({
  session,
  gameName,
  system,
}: {
  session: PlaySession;
  gameName: string;
  system: string;
}) {
  const days = sessionLengthDays(session);
  const open = session.endDate === null;

  return (
    <li className="flex items-baseline justify-between gap-3 border-b border-divider py-2.5 last:border-b-0">
      <div className="min-w-0">
        <p className="truncate text-sm text-emphasis">{gameName}</p>
        <p className="text-xs text-muted">
          {formatSessionRange(session)}
          {system !== "" && <span className="text-subtle"> · {systemLabel(system)}</span>}
        </p>
      </div>
      {/* tabular-nums so the right-hand column does not jitter down the list. */}
      <span className="shrink-0 text-xs tabular-nums text-subtle">
        {open ? "Playing" : days === 1 ? "1 day" : `${days} days`}
      </span>
    </li>
  );
}

export function PlayHistoryList({
  sessions,
  games,
  isLoading,
  error,
  emptyMessage,
}: PlayHistoryListProps) {
  // Rebuilt only when the library changes, not on every render of a long list.
  const gamesById = useMemo(() => new Map(games.map((game) => [game.id, game])), [games]);

  if (isLoading && sessions.length === 0) {
    return <p className="py-6 text-center text-sm text-muted">Loading play history...</p>;
  }

  const rows = sessionsInLibrary(sessions, new Set(gamesById.keys()));

  return (
    <>
      {error !== null && (
        <p role="alert" className="mb-3 text-xs text-red-600 dark:text-red-400">
          {error}
        </p>
      )}
      {rows.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted">{emptyMessage}</p>
      ) : (
        <ol>
          {rows.map((session) => {
            const game = gamesById.get(session.gameId)!;
            return (
              <SessionRow
                key={session.id}
                session={session}
                gameName={game.name}
                system={game.system}
              />
            );
          })}
        </ol>
      )}
    </>
  );
}
