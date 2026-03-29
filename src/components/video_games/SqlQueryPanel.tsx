"use client";

import { useState, useCallback, useMemo } from "react";
import type { Game } from "@/lib/games";
import { RATINGS } from "@/lib/games";

// ── SQL row shape ────────────────────────────────────────────────────────────
// The Game type has arrays (genres) and rich objects that don't map well to
// relational columns, so we flatten everything into a plain object here before
// handing it to AlaSQL.

type SqlRow = {
  name: string;
  system: string;
  rating: string | null; // "Perfect" | "Great" | … | null
  rating_letter: string | null; // "S" | "A" | "B" | "C" | "F" | null
  genres: string; // comma-separated, e.g. "Platform, Fighting"
  release_date: string | null; // "YYYY-MM-DD" or null
  release_year: number | null; // integer, e.g. 2024
  last_played: string | null; // "YYYY-MM-DD" or null
};

// Build a lookup map from rating name → letter using the shared RATINGS constant.
// e.g. { Perfect: "S", Great: "A", … }
const RATING_LETTER = Object.fromEntries(RATINGS.map((r) => [r.name, r.letter]));

function toSqlRow(game: Game): SqlRow {
  const y = game.releaseDate ? parseInt(game.releaseDate.slice(0, 4), 10) : NaN;
  return {
    name: game.name,
    system: game.system,
    rating: game.rating || null,
    rating_letter: game.rating ? (RATING_LETTER[game.rating] ?? null) : null,
    genres: game.genres.join(", "),
    release_date: game.releaseDate || null,
    release_year: isNaN(y) ? null : y,
    last_played: game.lastPlayed || null,
  };
}

// ── Schema reference ─────────────────────────────────────────────────────────

const SCHEMA_COLUMNS = [
  { name: "name", type: "TEXT", desc: "Game title", example: '"Astro Bot"' },
  { name: "system", type: "TEXT", desc: "Console or platform", example: '"PS5"' },
  { name: "rating", type: "TEXT", desc: "Rating name or NULL", example: '"Great"' },
  {
    name: "rating_letter",
    type: "TEXT",
    desc: "Letter grade or NULL",
    example: '"A"',
  },
  {
    name: "genres",
    type: "TEXT",
    desc: "Comma-separated genres",
    example: '"Platform, Fighting"',
  },
  {
    name: "release_date",
    type: "TEXT",
    desc: "ISO date (YYYY-MM-DD) or NULL",
    example: '"2024-09-06"',
  },
  {
    name: "release_year",
    type: "INT",
    desc: "Year extracted from release_date",
    example: "2024",
  },
  {
    name: "last_played",
    type: "TEXT",
    desc: "ISO date or NULL",
    example: '"2024-09-06"',
  },
];

// ── Example queries ──────────────────────────────────────────────────────────
// Note: "count" and "total" are reserved words in AlaSQL 4.x — use aliases
// like "cnt" or "num" instead. Column names from the data are fine to use.

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
    sql: `SELECT rating, rating_letter, COUNT(*) AS cnt
FROM games
WHERE rating IS NOT NULL
GROUP BY rating, rating_letter
ORDER BY cnt DESC`,
  },
  {
    label: "Perfect games",
    sql: `SELECT name, system, genres
FROM games
WHERE rating = 'Perfect'
ORDER BY name`,
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

// ── Query executor ───────────────────────────────────────────────────────────
// Dynamically imports AlaSQL so it stays out of the server-render bundle.
// AlaSQL is registered globally — we create and drop the "games" table around
// each query so the user writes natural SQL without placeholder syntax.

async function execQuery(sql: string, rows: SqlRow[]): Promise<Record<string, unknown>[]> {
  // next/dynamic isn't needed here because this function only runs inside a
  // click handler (never on the server).
  const mod = await import("alasql");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const alasql = (mod as any).default ?? mod;

  alasql("DROP TABLE IF EXISTS games");
  alasql("CREATE TABLE games");
  // Shallow-copy each row so AlaSQL can't mutate our source data.
  alasql.tables["games"].data = rows.map((r) => ({ ...r }));

  try {
    const result = alasql(sql);
    return Array.isArray(result) ? result : [{ result }];
  } finally {
    // Always clean up even if the query throws, so the next run starts clean.
    alasql("DROP TABLE IF EXISTS games");
  }
}

// ── Component ────────────────────────────────────────────────────────────────

type SqlQueryPanelProps = {
  games: Game[];
};

export function SqlQueryPanel({ games }: SqlQueryPanelProps) {
  // Map Game[] to flat SQL rows once per render (games prop is stable — it's
  // set from the server and never changes during the session).
  const rows = useMemo(() => games.map(toSqlRow), [games]);

  const [sql, setSql] = useState(EXAMPLE_QUERIES[0].sql);
  const [results, setResults] = useState<Record<string, unknown>[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isRunning, setIsRunning] = useState(false);

  const handleRun = useCallback(async () => {
    if (!sql.trim()) return;
    setIsRunning(true);
    setError(null);
    setResults(null);
    try {
      const data = await execQuery(sql, rows);
      setResults(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setIsRunning(false);
    }
  }, [sql, rows]);

  const handleClear = useCallback(() => {
    setSql("");
    setResults(null);
    setError(null);
  }, []);

  // Derive column names from the first result row for the table header.
  const columns = results && results.length > 0 ? Object.keys(results[0]) : [];

  return (
    <div className="space-y-8">
      {/* ─── Schema reference ─── */}
      <section>
        <h3 className="text-xs font-semibold uppercase tracking-widest text-subtle mb-3">
          Schema —{" "}
          <code className="font-mono text-link lowercase tracking-normal">games</code>
        </h3>
        <div className="overflow-x-auto rounded-lg border border-divider">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-divider bg-background">
                <th className="px-3 py-2 text-left text-xs font-semibold text-muted">
                  Column
                </th>
                <th className="px-3 py-2 text-left text-xs font-semibold text-muted">
                  Type
                </th>
                <th className="px-3 py-2 text-left text-xs font-semibold text-muted hidden sm:table-cell">
                  Description
                </th>
                <th className="px-3 py-2 text-left text-xs font-semibold text-muted hidden md:table-cell">
                  Example
                </th>
              </tr>
            </thead>
            <tbody>
              {SCHEMA_COLUMNS.map((col, i) => (
                <tr
                  key={col.name}
                  className={i % 2 === 0 ? "bg-background" : "bg-divider/20"}
                >
                  <td className="px-3 py-2 font-mono text-xs text-link">{col.name}</td>
                  <td className="px-3 py-2 font-mono text-xs text-muted">{col.type}</td>
                  <td className="px-3 py-2 text-xs text-muted hidden sm:table-cell">
                    {col.desc}
                  </td>
                  <td className="px-3 py-2 font-mono text-xs text-subtle hidden md:table-cell">
                    {col.example}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {/* AlaSQL quirk callout */}
        <p className="mt-2 text-xs text-muted">
          <span className="font-medium">Note:</span>{" "}
          <code className="font-mono">count</code> and{" "}
          <code className="font-mono">total</code> are reserved words — use aliases like{" "}
          <code className="font-mono">cnt</code> or <code className="font-mono">num</code>{" "}
          instead.
        </p>
      </section>

      {/* ─── Example queries ─── */}
      <section>
        <h3 className="text-xs font-semibold uppercase tracking-widest text-subtle mb-3">
          Examples
        </h3>
        <div className="flex flex-wrap gap-2">
          {EXAMPLE_QUERIES.map((ex) => (
            <button
              key={ex.label}
              type="button"
              onClick={() => {
                setSql(ex.sql);
                setResults(null);
                setError(null);
              }}
              className="px-3 py-1.5 rounded-md text-xs border border-divider text-muted hover:border-link hover:text-link hover:bg-link/5 transition-colors cursor-pointer"
            >
              {ex.label}
            </button>
          ))}
        </div>
      </section>

      {/* ─── Query editor ─── */}
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
              handleRun();
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
            onClick={handleRun}
            disabled={isRunning || !sql.trim()}
            className="flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium bg-link text-white hover:bg-link-hover disabled:opacity-50 disabled:cursor-not-allowed transition-colors cursor-pointer"
          >
            {isRunning ? "Running…" : "▶  Run Query"}
          </button>
          <button
            type="button"
            onClick={handleClear}
            className="px-3 py-2 rounded-md text-sm text-muted border border-divider hover:text-foreground hover:border-foreground/30 transition-colors cursor-pointer"
          >
            Clear
          </button>
          <span className="ml-auto text-xs text-muted hidden sm:inline">⌘ + Enter to run</span>
        </div>
      </section>

      {/* ─── Error display ─── */}
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

      {/* ─── Results table ─── */}
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
