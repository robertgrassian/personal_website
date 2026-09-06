"use client";

import { useMemo } from "react";
import type { Game } from "@/lib/games";
import { RATINGS, UNRATED_LABEL, systemLabel } from "@/lib/games";
import { formatDayShort, type PlaySession } from "@/lib/sessions";
import { compareIso } from "./pipeline";

// How many rows "Recently Started" shows before deferring to the full history.
const RECENT_LIMIT = 5;

type GameStatsProps = {
  games: Game[];
  // The library's play sessions, already narrowed to games still in `games`.
  // "Recently Started" cannot be derived from `games` alone: a Game carries the
  // newest session's END date and the OPEN session's start, so the date a
  // FINISHED playthrough began exists only on the session rows.
  sessions: PlaySession[];
  // Sessions are a separate, lazy fetch (see usePlayHistory), so this section
  // has load and error states the rest of the panel does not.
  sessionsLoading: boolean;
  sessionsError: string | null;
  // Undefined renders no link, for a surface with no history view.
  onSeeAllPlayed?: () => void;
};

function BarRow({
  label,
  count,
  pct,
  color,
}: {
  label: string;
  count: number;
  pct: number;
  color?: string;
}) {
  return (
    <div className="flex items-center gap-3">
      <span className="w-36 shrink-0 text-sm text-muted truncate text-right" title={label}>
        {label}
      </span>
      <div className="flex-1 h-2 rounded-full bg-divider overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{ width: `${pct}%`, background: color ?? "var(--link)" }}
        />
      </div>
      <span className="w-8 shrink-0 text-right text-sm tabular-nums text-muted">{count}</span>
    </div>
  );
}

function StatCard({
  value,
  label,
  accent,
}: {
  value: number | string;
  label: string;
  accent?: boolean;
}) {
  return (
    <div
      className={`flex flex-col items-center justify-center rounded-lg border px-3 py-4 text-center ${
        accent ? "border-link/30 bg-link/5" : "border-divider bg-background"
      }`}
    >
      <span className={`text-2xl font-bold tabular-nums ${accent ? "text-link" : "text-emphasis"}`}>
        {value}
      </span>
      <span className="mt-1 text-xs text-muted">{label}</span>
    </div>
  );
}

function StatsSection({
  title,
  action,
  children,
}: {
  title: string;
  /** Sits right after the heading text, not across the row: at panel width a
   *  right-aligned link reads as the panel's, not this section's. */
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section>
      <div className="mb-3 flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h3 className="text-xs font-semibold uppercase tracking-widest text-subtle">{title}</h3>
        {action}
      </div>
      {children}
    </section>
  );
}

export function GameStats({
  games,
  sessions,
  sessionsLoading,
  sessionsError,
  onSeeAllPlayed,
}: GameStatsProps) {
  const stats = useMemo(() => {
    const ratingMap = new Map<string, number>(RATINGS.map((r) => [r.name, 0]));
    ratingMap.set(UNRATED_LABEL, 0);
    for (const game of games) {
      const key = game.rating || UNRATED_LABEL;
      ratingMap.set(key, (ratingMap.get(key) ?? 0) + 1);
    }

    const ratingRows = [
      ...RATINGS.map((r) => ({
        name: r.name,
        letter: r.letter,
        color: r.color,
        count: ratingMap.get(r.name) ?? 0,
      })),
      // Appended rather than part of RATINGS: it is the absence of a rating, and
      // the "·" and neutral token are what keep it from reading as a sixth grade.
      {
        name: UNRATED_LABEL,
        letter: "·",
        color: "var(--rating-unrated)",
        count: ratingMap.get(UNRATED_LABEL) ?? 0,
      },
    ];

    const systemMap = new Map<string, number>();
    for (const game of games) {
      systemMap.set(game.system, (systemMap.get(game.system) ?? 0) + 1);
    }
    const systems = [...systemMap.entries()]
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count);

    const genreMap = new Map<string, number>();
    for (const game of games) {
      for (const genre of game.genres) {
        if (genre) genreMap.set(genre, (genreMap.get(genre) ?? 0) + 1);
      }
    }
    const genres = [...genreMap.entries()]
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    const decadeMap = new Map<string, number>();
    for (const game of games) {
      const y = parseInt(game.releaseDate?.slice(0, 4) ?? "");
      if (!isNaN(y) && y >= 1970) {
        const decade = `${Math.floor(y / 10) * 10}s`;
        decadeMap.set(decade, (decadeMap.get(decade) ?? 0) + 1);
      }
    }
    const decades = [...decadeMap.entries()]
      .map(([decade, count]) => ({ decade, count }))
      // "1990s", "2000s" — fixed-width and machine-generated, so byte order is
      // collation order.
      .sort((a, b) => compareIso(a.decade, b.decade));

    return {
      total: games.length,
      uniqueSystems: systemMap.size,
      uniqueGenres: genreMap.size,
      perfectCount: ratingMap.get("Perfect") ?? 0,
      ratingRows,
      systems,
      genres,
      decades,
    };
  }, [games]);

  // Kept out of the memo above because it depends on the sessions fetch, which
  // lands later than `games` and would otherwise rebuild every histogram with
  // it.
  //
  // Ranked by the date a playthrough BEGAN, which is the whole point of the
  // rename from "Recently Played": that list sorted in-progress games to the
  // top and then went by end date, so a game finished in a day fell off the
  // bottom while three long-running sessions held the slots.
  const recentlyStarted = useMemo(() => {
    const gamesById = new Map(games.map((game) => [game.id, game]));
    // The API already returns sessions newest-start-first, but sorting here
    // makes the ranking this list's own rather than a fetch-order coincidence.
    // Newer id breaks a same-day tie, matching the API's own second key.
    const newestFirst = [...sessions].sort(
      (a, b) => compareIso(b.startDate, a.startDate) || b.id - a.id
    );

    const rows: { session: PlaySession; game: Game }[] = [];
    const seen = new Set<number>();
    for (const session of newestFirst) {
      // One row per GAME, not per session: the first session a game reaches
      // here is its most recent start, and the rest are history.
      if (seen.has(session.gameId)) continue;
      const game = gamesById.get(session.gameId);
      if (game === undefined) continue;
      seen.add(session.gameId);
      rows.push({ session, game });
      if (rows.length === RECENT_LIMIT) break;
    }
    return rows;
  }, [games, sessions]);

  // null under an error: the alert above already says why the list is empty,
  // and "nothing has been played" would be a claim about the library that a
  // failed fetch cannot support.
  const recentEmptyMessage = sessionsLoading
    ? "Loading play history..."
    : sessionsError === null
      ? "No games have been played yet."
      : null;

  const maxSystemCount = stats.systems[0]?.count ?? 1;
  const maxGenreCount = stats.genres[0]?.count ?? 1;
  const maxRatingCount = Math.max(...stats.ratingRows.map((r) => r.count), 1);
  const maxDecadeCount = Math.max(...stats.decades.map((d) => d.count), 1);

  return (
    <div className="space-y-8">
      <StatsSection title="Overview">
        <div className="grid grid-cols-2 gap-2">
          <StatCard value={stats.total} label="Total Games" />
          <StatCard value={stats.uniqueSystems} label="Systems" />
          <StatCard value={stats.uniqueGenres} label="Genres" />
          <StatCard value={stats.perfectCount} label="Perfect (S)" accent />
        </div>
      </StatsSection>

      {/* Rendered while loading and on error too, not only when there are rows:
          the sessions arrive after the panel does, and a section that appears
          a beat later shifts everything under it. */}
      {(recentlyStarted.length > 0 || sessionsLoading || sessionsError !== null) && (
        <StatsSection
          title="Recently Started"
          action={
            onSeeAllPlayed && (
              <button
                type="button"
                onClick={onSeeAllPlayed}
                className="shrink-0 text-xs font-medium text-link hover:underline cursor-pointer"
              >
                See all
              </button>
            )
          }
        >
          {sessionsError !== null && (
            <p role="alert" className="mb-2 text-xs text-red-600 dark:text-red-400">
              {sessionsError}
            </p>
          )}
          {recentlyStarted.length === 0 ? (
            recentEmptyMessage !== null && (
              <p className="text-sm text-muted">{recentEmptyMessage}</p>
            )
          ) : (
            <ol className="space-y-2">
              {recentlyStarted.map(({ session, game }, i) => (
                <li key={session.id} className="flex items-baseline gap-3">
                  <span className="w-5 shrink-0 text-sm font-bold tabular-nums text-muted text-right">
                    {i + 1}.
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-emphasis truncate">{game.name}</p>
                    <p className="text-xs text-muted truncate">
                      {systemLabel(game.system)}
                      {session.endDate === null && (
                        <span className="text-link"> · Playing now</span>
                      )}
                    </p>
                  </div>
                  {/* The date this playthrough started, which is what the list
                      is ordered by: showing anything else would leave the order
                      looking arbitrary. */}
                  <span className="shrink-0 text-xs tabular-nums text-subtle">
                    {formatDayShort(session.startDate)}
                  </span>
                </li>
              ))}
            </ol>
          )}
        </StatsSection>
      )}

      <StatsSection title="Ratings">
        <div className="space-y-2.5">
          {stats.ratingRows
            .filter((r) => r.count > 0)
            .map((row) => (
              <div key={row.name} className="flex items-center gap-3">
                <span
                  className="w-6 h-6 shrink-0 flex items-center justify-center rounded text-xs font-bold text-gray-900"
                  style={{ background: row.color }}
                >
                  {row.letter}
                </span>
                <div className="flex-1 h-2 rounded-full bg-divider overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{
                      width: `${(row.count / maxRatingCount) * 100}%`,
                      background: row.color,
                    }}
                  />
                </div>
                <span className="w-8 shrink-0 text-right text-sm tabular-nums text-muted">
                  {row.count}
                </span>
              </div>
            ))}
        </div>
      </StatsSection>

      <StatsSection title="By Platform">
        <div className="space-y-2.5">
          {stats.systems.map((s) => (
            <BarRow
              key={s.name}
              label={systemLabel(s.name)}
              count={s.count}
              pct={(s.count / maxSystemCount) * 100}
            />
          ))}
        </div>
      </StatsSection>

      <StatsSection title="Top Genres">
        <div className="space-y-2.5">
          {stats.genres.map((g) => (
            <BarRow
              key={g.name}
              label={g.name}
              count={g.count}
              pct={(g.count / maxGenreCount) * 100}
              color="var(--stats-genres)"
            />
          ))}
        </div>
      </StatsSection>

      {stats.decades.length > 0 && (
        <StatsSection title="Release Era">
          <div className="space-y-2.5">
            {stats.decades.map((d) => (
              <BarRow
                key={d.decade}
                label={d.decade}
                count={d.count}
                pct={(d.count / maxDecadeCount) * 100}
                color="var(--stats-decades)"
              />
            ))}
          </div>
        </StatsSection>
      )}
    </div>
  );
}
