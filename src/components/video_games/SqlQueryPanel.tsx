"use client";

import { useState, useCallback, useMemo } from "react";
import type { Game } from "@/lib/games";
import { RATINGS, gameGenres } from "@/lib/games";

// --- Row types ---

type GameRow = {
  name: string;
  system: string;
  rating: string | null;       // letter grade, e.g. "A"
  genres: string;              // comma-separated, e.g. "Platform, Fighting"
  release_date: string | null; // "YYYY-MM-DD"
  release_year: number | null;
  last_played: string | null;  // "YYYY-MM-DD"
};

// Normalized join table: one row per game-genre pair.
// Mirrors how the shelf grouping works in the library view.
type GameGenreRow = {
  name: string;
  genre: string;
};

const RATING_LETTER = Object.fromEntries(RATINGS.map((r) => [r.name, r.letter]));

function toGameRow(game: Game): GameRow {
  const y = game.releaseDate ? parseInt(game.releaseDate.slice(0, 4), 10) : NaN;
  return {
    name: game.name,
    system: game.system,
    rating: game.rating ? (RATING_LETTER[game.rating] ?? null) : null,
    genres: game.genres.join(", "),
    release_date: game.releaseDate || null,
    release_year: isNaN(y) ? null : y,
    last_played: game.lastPlayed || null,
  };
}

function toGameGenreRows(game: Game): GameGenreRow[] {
  return gameGenres(game).map((genre) => ({ name: game.name, genre }));
}

// --- Schema definition ---

const GAMES_COLUMNS = [
  { name: "name",         desc: "Game title" },
  { name: "system",       desc: "Console or platform" },
  { name: "rating",       desc: "S / A / B / C / F — or NULL if unrated" },
  { name: "genres",       desc: "Comma-separated; e.g. \"Platform, Fighting\"" },
  { name: "release_date", desc: "ISO date (YYYY-MM-DD) or NULL" },
  { name: "release_year", desc: "Year as integer, e.g. 2024" },
  { name: "last_played",  desc: "ISO date or NULL" },
];

// game_genres is the exploded version of games.genres — one row per game-genre pair.
// Multi-genre games appear once per genre. Join to games on name.
const GAME_GENRES_COLUMNS = [
  { name: "name",  desc: "Game title — joins to games.name" },
  { name: "genre", desc: "Single genre value" },
];

// --- Example queries ---

// AlaSQL reserves "count" and "total" as keywords — use aliases like "cnt" instead.
const EXAMPLE_QUERIES = [
  {
    label: "By platform",
    sql: `SELECT system, COUNT(*) AS cnt
FROM games
GROUP BY system
ORDER BY cnt DESC`,
  },
  {
    label: "By rating",
    sql: `SELECT rating, COUNT(*) AS cnt
FROM games
WHERE rating IS NOT NULL
GROUP BY rating
ORDER BY cnt DESC`,
  },
  {
    label: "S-tier games",
    sql: `SELECT name, system
FROM games
WHERE rating = 'S'
ORDER BY name`,
  },
  {
    label: "By genre",
    sql: `SELECT genre, COUNT(*) AS cnt
FROM game_genres
GROUP BY genre
ORDER BY cnt DESC`,
  },
  {
    label: "By decade",
    sql: `SELECT FLOOR(release_year / 10) * 10 AS decade, COUNT(*) AS cnt
FROM games
WHERE release_year IS NOT NULL
GROUP BY decade
ORDER BY decade`,
  },
  {
    label: "Sample rows",
    sql: `SELECT *
FROM games
LIMIT 10`,
  },
];

// --- Query execution ---

// Only SELECT statements are allowed.
function validateQuery(sql: string): string | null {
  const normalized = sql.trim().replace(/\s+/g, " ").toUpperCase();
  if (!normalized.startsWith("SELECT")) {
    return "Only SELECT queries are supported.";
  }
  const blocked = /\b(INSERT|UPDATE|DELETE|DROP|CREATE|ALTER|EXEC|EXECUTE|TRUNCATE|REPLACE|MERGE)\b/;
  if (blocked.test(normalized)) {
    return "Query contains a disallowed keyword. Only SELECT is permitted.";
  }
  return null;
}

// AlaSQL runs entirely in the browser against in-memory data.
// Both tables are created fresh for each query and dropped afterward.
async function execQuery(
  sql: string,
  gameRows: GameRow[],
  gameGenreRows: GameGenreRow[],
): Promise<Record<string, unknown>[]> {
  const validationError = validateQuery(sql);
  if (validationError) throw new Error(validationError);

  const mod = await import("alasql");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const alasql = (mod as any).default ?? mod;

  alasql("DROP TABLE IF EXISTS games");
  alasql("DROP TABLE IF EXISTS game_genres");
  alasql("CREATE TABLE games");
  alasql("CREATE TABLE game_genres");
  alasql.tables["games"].data = gameRows.map((r) => ({ ...r }));
  alasql.tables["game_genres"].data = gameGenreRows.map((r) => ({ ...r }));

  try {
    const result = alasql(sql);
    return Array.isArray(result) ? result : [{ result }];
  } finally {
    alasql("DROP TABLE IF EXISTS games");
    alasql("DROP TABLE IF EXISTS game_genres");
  }
}

// --- Component ---

type SqlQueryPanelProps = {
  games: Game[];
};

export function SqlQueryPanel({ games }: SqlQueryPanelProps) {
  const gameRows = useMemo(() => games.map(toGameRow), [games]);
  const gameGenreRows = useMemo(() => games.flatMap(toGameGenreRows), [games]);

  const [sql, setSql] = useState(EXAMPLE_QUERIES[0].sql);
  const [results, setResults] = useState<Record<string, unknown>[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isRunning, setIsRunning] = useState(false);

  const runQuery = useCallback(async (query: string) => {
    if (!query.trim()) return;
    setSql(query);
    setIsRunning(true);
    setError(null);
    setResults(null);
    try {
      const data = await execQuery(query, gameRows, gameGenreRows);
      setResults(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setIsRunning(false);
    }
  }, [gameRows, gameGenreRows]);

  const handleClear = useCallback(() => {
    setSql("");
    setResults(null);
    setError(null);
  }, []);

  const columns = results && results.length > 0 ? Object.keys(results[0]) : [];

  return (
    <div className="space-y-8">
      {/* Schema reference */}
      <section className="space-y-3">
        <h3 className="text-xs font-semibold uppercase tracking-widest text-subtle">Schema</h3>

        <div>
          <p className="text-xs font-mono text-muted mb-1.5">
            <span className="text-link">games</span>
          </p>
          <div className="flex flex-wrap gap-1.5">
            {GAMES_COLUMNS.map((col) => (
              <button
                key={col.name}
                type="button"
                title={col.desc}
                onClick={() => runQuery(`SELECT DISTINCT ${col.name}\nFROM games\nORDER BY ${col.name}`)}
                className="px-2 py-1 rounded bg-divider/40 font-mono text-xs text-link hover:bg-link/10 transition-colors cursor-pointer"
              >
                {col.name}
              </button>
            ))}
          </div>
        </div>

        <div>
          <p className="text-xs font-mono text-muted mb-1.5">
            <span className="text-link">game_genres</span>
            <span className="text-subtle ml-2">— join to games on name</span>
          </p>
          <div className="flex flex-wrap gap-1.5">
            {GAME_GENRES_COLUMNS.map((col) => (
              <button
                key={col.name}
                type="button"
                title={col.desc}
                onClick={() => runQuery(`SELECT DISTINCT ${col.name}\nFROM game_genres\nORDER BY ${col.name}`)}
                className="px-2 py-1 rounded bg-divider/40 font-mono text-xs text-link hover:bg-link/10 transition-colors cursor-pointer"
              >
                {col.name}
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* Example queries */}
      <section>
        <h3 className="text-xs font-semibold uppercase tracking-widest text-subtle mb-3">
          Examples
        </h3>
        <div className="flex flex-wrap gap-2">
          {EXAMPLE_QUERIES.map((ex) => (
            <button
              key={ex.label}
              type="button"
              onClick={() => runQuery(ex.sql)}
              className="px-3 py-1.5 rounded-md text-xs border border-divider text-muted hover:border-link hover:text-link hover:bg-link/5 transition-colors cursor-pointer"
            >
              {ex.label}
            </button>
          ))}
        </div>
      </section>

      {/* Query editor */}
      <section>
        <h3 className="text-xs font-semibold uppercase tracking-widest text-subtle mb-3">
          Query
        </h3>
        <textarea
          value={sql}
          onChange={(e) => setSql(e.target.value)}
          onKeyDown={(e) => {
            // Cmd/Ctrl+Enter runs the query without submitting a form.
            if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
              e.preventDefault();
              runQuery(sql);
            }
          }}
          rows={6}
          spellCheck={false}
          className="w-full font-mono text-sm bg-background border border-divider rounded-lg px-4 py-3 text-foreground placeholder:text-muted resize-y focus:outline-none focus:ring-2 focus:ring-link/40 focus:border-link/60 transition-colors"
          placeholder="SELECT * FROM games LIMIT 10"
        />
        <div className="flex items-center gap-3 mt-3">
          <button
            type="button"
            onClick={() => runQuery(sql)}
            disabled={isRunning || !sql.trim()}
            className="flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium bg-link text-white hover:bg-link-hover disabled:opacity-50 disabled:cursor-not-allowed transition-colors cursor-pointer"
          >
            {isRunning ? "Running..." : "Run Query"}
          </button>
          <button
            type="button"
            onClick={handleClear}
            className="px-3 py-2 rounded-md text-sm text-muted border border-divider hover:text-foreground hover:border-foreground/30 transition-colors cursor-pointer"
          >
            Clear
          </button>
          <span className="ml-auto text-xs text-muted hidden sm:inline">Cmd+Enter to run</span>
        </div>
      </section>

      {error && (
        <div
          className="rounded-lg border border-divider bg-background px-4 py-3 border-l-4"
          style={{ borderLeftColor: "var(--rating-f)" }}
        >
          <p className="text-sm font-medium text-emphasis">Query error</p>
          <p className="mt-1 text-xs font-mono text-muted whitespace-pre-wrap break-words">
            {error}
          </p>
        </div>
      )}

      {results !== null && (
        <section>
          <h3 className="text-xs font-semibold uppercase tracking-widest text-subtle mb-3">
            Results —{" "}
            <span className="tabular-nums">{results.length}</span>{" "}
            {results.length === 1 ? "row" : "rows"}
          </h3>

          {results.length === 0 ? (
            <p className="text-sm text-muted italic">Query returned no rows.</p>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-divider">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-divider bg-background">
                    {columns.map((col) => (
                      <th
                        key={col}
                        className="px-3 py-2 text-left text-xs font-semibold font-mono text-link whitespace-nowrap"
                      >
                        {col}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {results.map((row, i) => (
                    <tr
                      key={i}
                      className={`border-b border-divider/50 last:border-0 ${
                        i % 2 === 0 ? "" : "bg-divider/20"
                      }`}
                    >
                      {columns.map((col) => {
                        const val = row[col];
                        return (
                          <td
                            key={col}
                            className="px-3 py-2 text-xs font-mono text-foreground whitespace-nowrap max-w-xs truncate"
                            title={val == null ? "" : String(val)}
                          >
                            {val == null ? (
                              <span className="text-muted italic">NULL</span>
                            ) : (
                              String(val)
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
