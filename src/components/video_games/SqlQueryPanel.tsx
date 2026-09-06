"use client";

import { useState, useCallback, useMemo } from "react";
import type { Game } from "@/lib/games";
import type { WishlistGame } from "@/lib/wishlist";
import type { PlaySession } from "@/lib/sessions";
import { Button } from "@/components/ui/Button";
import { ChevronDownIcon } from "@/components/Icon";
import {
  EXAMPLE_QUERIES,
  QUERY_SCHEMA,
  buildQueryTables,
  distinctQuery,
  type QueryTables,
  type SchemaTable,
} from "./queryTables";

// The tables, their columns and the example queries all live in
// queryTables.ts, which `npm test` executes against a fixture library. This
// file is the UI around them.

// --- Query execution ---

// Only SELECT statements are allowed.
function validateQuery(sql: string): string | null {
  const normalized = sql.trim().replace(/\s+/g, " ").toUpperCase();
  if (!normalized.startsWith("SELECT")) {
    return "Only SELECT queries are supported.";
  }
  const blocked =
    /\b(INSERT|UPDATE|DELETE|DROP|CREATE|ALTER|EXEC|EXECUTE|TRUNCATE|REPLACE|MERGE)\b/;
  if (blocked.test(normalized)) {
    return "Query contains a disallowed keyword. Only SELECT is permitted.";
  }
  return null;
}

const ROW_LIMIT = 500;

type QueryResult = {
  rows: Record<string, unknown>[];
  truncated: boolean;
};

// AlaSQL runs entirely in the browser against in-memory data. Every table is
// created fresh for each query and dropped afterward.
async function execQuery(sql: string, tables: QueryTables): Promise<QueryResult> {
  const validationError = validateQuery(sql);
  if (validationError) throw new Error(validationError);

  const mod = await import("alasql");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const alasql = (mod as any).default ?? mod;

  const names = Object.keys(tables) as (keyof QueryTables)[];
  const drop = () => names.forEach((name) => alasql(`DROP TABLE IF EXISTS ${name}`));

  drop();
  for (const name of names) {
    alasql(`CREATE TABLE ${name}`);
    // Copied row by row: AlaSQL mutates the arrays it is handed, and these are
    // the memoized ones the component re-renders from.
    alasql.tables[name].data = tables[name].map((row) => ({ ...row }));
  }

  try {
    const result = alasql(sql);
    const rows: Record<string, unknown>[] = Array.isArray(result) ? result : [{ result }];
    const truncated = rows.length > ROW_LIMIT;
    return { rows: truncated ? rows.slice(0, ROW_LIMIT) : rows, truncated };
  } finally {
    drop();
  }
}

// --- Schema reference ---

// One table, collapsed to a single row until it is opened. `<details>` rather
// than useState: it keeps its own open/closed state in the DOM, which survives
// a tab switch here because the panel is hidden with CSS rather than unmounted.
function SchemaTableDetails({
  table,
  rowCount,
  onPickColumn,
}: {
  table: SchemaTable;
  rowCount: number;
  onPickColumn: (table: string, column: string) => void;
}) {
  return (
    // All five start closed. `games` alone is 17 columns, which is enough to
    // push the query box itself below the fold on a laptop.
    <details className="group rounded-lg border border-divider">
      {/* list-none plus the webkit rule removes the UA disclosure triangle, so
          the chevron below is the only marker. */}
      <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2 hover:bg-link/5 [&::-webkit-details-marker]:hidden">
        <ChevronDownIcon
          className="w-4 h-4 shrink-0 text-subtle transition-transform group-open:rotate-180"
          aria-hidden
        />
        <span className="font-mono text-xs text-link">{table.name}</span>
        <span className="truncate text-xs text-subtle">{table.summary}</span>
        <span className="ml-auto shrink-0 text-xs tabular-nums text-subtle">
          {rowCount.toLocaleString()}
        </span>
      </summary>
      <ul className="border-t border-divider px-3 py-2 space-y-1.5">
        {table.columns.map((col) => (
          <li key={col.name} className="flex items-baseline gap-2">
            <button
              type="button"
              onClick={() => onPickColumn(table.name, col.name)}
              className="shrink-0 rounded bg-divider/40 px-1.5 py-0.5 font-mono text-xs text-link hover:bg-link/10 transition-colors cursor-pointer"
            >
              {col.name}
            </button>
            <span className="text-xs text-muted">{col.desc}</span>
          </li>
        ))}
      </ul>
    </details>
  );
}

// --- Component ---

type SqlQueryPanelProps = {
  games: Game[];
  // Already narrowed to games still in the library, by the caller that also
  // renders the history list from them.
  sessions: PlaySession[];
  wishlist: WishlistGame[];
};

export function SqlQueryPanel({ games, sessions, wishlist }: SqlQueryPanelProps) {
  const tables = useMemo(
    () => buildQueryTables(games, sessions, wishlist),
    [games, sessions, wishlist]
  );

  const [sql, setSql] = useState(EXAMPLE_QUERIES[0].sql);
  const [results, setResults] = useState<Record<string, unknown>[] | null>(null);
  const [truncated, setTruncated] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isRunning, setIsRunning] = useState(false);

  const runQuery = useCallback(
    async (query: string) => {
      if (!query.trim()) return;
      setSql(query);
      setIsRunning(true);
      setError(null);
      setResults(null);
      setTruncated(false);
      try {
        const { rows, truncated } = await execQuery(query, tables);
        setResults(rows);
        setTruncated(truncated);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setIsRunning(false);
      }
    },
    [tables]
  );

  const pickColumn = useCallback(
    (table: string, column: string) => runQuery(distinctQuery(table, column)),
    [runQuery]
  );

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
        <p className="text-xs text-muted">
          Five read-only tables built from this library. Open one to see its columns, and click a
          column to list its values.
        </p>

        <div className="space-y-2">
          {QUERY_SCHEMA.map((table) => (
            <SchemaTableDetails
              key={table.name}
              table={table}
              rowCount={tables[table.name].length}
              onPickColumn={pickColumn}
            />
          ))}
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
        <h3 className="text-xs font-semibold uppercase tracking-widest text-subtle mb-3">Query</h3>
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
          <Button
            variant="primary"
            size="md"
            onClick={() => runQuery(sql)}
            disabled={isRunning || !sql.trim()}
            className="flex items-center gap-2 text-sm"
          >
            {isRunning ? "Running..." : "Run Query"}
          </Button>
          <Button variant="secondary" size="md" onClick={handleClear} className="text-sm">
            Clear
          </Button>
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
            Results:{" "}
            <span className="tabular-nums">{truncated ? `${ROW_LIMIT}+` : results.length}</span>{" "}
            {results.length === 1 && !truncated ? "row" : "rows"}
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
