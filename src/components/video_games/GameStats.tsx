"use client";

import { useMemo } from "react";
import type { Game } from "@/lib/games";
import { RATINGS } from "@/lib/games";

type GameStatsProps = {
  games: Game[];
  // In-progress games — may be unrated, so not present in `games`. Unioned into
  // "Recently Played" so a game you're playing now still shows up there.
  currentlyPlayingGames: Game[];
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

function StatsSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="text-xs font-semibold uppercase tracking-widest text-subtle mb-3">{title}</h3>
      {children}
    </section>
  );
}

export function GameStats({ games, currentlyPlayingGames }: GameStatsProps) {
  const stats = useMemo(() => {
    const ratingMap = new Map<string, number>(RATINGS.map((r) => [r.name, 0]));
    ratingMap.set("Unrated", 0);
    for (const game of games) {
      const key = game.rating || "Unrated";
      ratingMap.set(key, (ratingMap.get(key) ?? 0) + 1);
    }

    const ratingRows = [
      ...RATINGS.map((r) => ({
        name: r.name,
        letter: r.letter,
        color: r.color,
        count: ratingMap.get(r.name) ?? 0,
      })),
      { name: "Unrated", letter: "·", color: "#9ca3af", count: ratingMap.get("Unrated") ?? 0 },
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

    // Currently-playing games rank first (active right now), ordered by most
    // recent start; finished games follow, ordered by newest play date.
    // currentlyPlayingGames leads the concat so the dedup keeps that instance
    // even when the same game (a rated replay) also appears in `games`.
    // Only games that have actually been played qualify; dedup by name after
    // that test so a non-qualifying entry never marks a name as seen and blocks
    // a later qualifying one with the same name.
    const seen = new Set<string>();
    const recentlyPlayed = [...currentlyPlayingGames, ...games]
      .filter((g) => {
        if (!(g.currentlyPlaying || g.lastPlayed !== "")) return false;
        if (seen.has(g.name)) return false;
        seen.add(g.name);
        return true;
      })
      .sort((a, b) => {
        if (a.currentlyPlaying !== b.currentlyPlaying) return a.currentlyPlaying ? -1 : 1;
        if (a.currentlyPlaying) return b.playingSince.localeCompare(a.playingSince);
        return b.lastPlayed.localeCompare(a.lastPlayed);
      })
      .slice(0, 3);

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
      .sort((a, b) => a.decade.localeCompare(b.decade));

    return {
      total: games.length,
      uniqueSystems: systemMap.size,
      uniqueGenres: genreMap.size,
      perfectCount: ratingMap.get("Perfect") ?? 0,
      ratingRows,
      systems,
      genres,
      recentlyPlayed,
      decades,
    };
  }, [games, currentlyPlayingGames]);

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

      {stats.recentlyPlayed.length > 0 && (
        <StatsSection title="Recently Played">
          <ol className="space-y-2">
            {stats.recentlyPlayed.map((game, i) => (
              <li key={game.name} className="flex items-center gap-3">
                <span className="w-5 shrink-0 text-sm font-bold tabular-nums text-muted text-right">
                  {i + 1}.
                </span>
                <div className="min-w-0">
                  <p className="text-sm text-emphasis truncate">{game.name}</p>
                  <p className="text-xs text-muted">{game.system}</p>
                </div>
              </li>
            ))}
          </ol>
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
              label={s.name}
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
