import { test } from "node:test";
import assert from "node:assert/strict";
import alasql from "alasql";
import type { Game } from "../../lib/games.ts";
import type { WishlistGame } from "../../lib/wishlist.ts";
import type { PlaySession } from "../../lib/sessions.ts";
import {
  EXAMPLE_QUERIES,
  QUERY_SCHEMA,
  buildQueryTables,
  distinctQuery,
  type QueryTables,
} from "./queryTables.ts";

// Run with `npm test`. This is the query tab's audit, and it exists because
// AlaSQL fails QUIETLY: MAX() over a string column drops that column from the
// result instead of erroring, so a shipped example can look plausible in review
// and return nothing on screen. Every example and every column chip is executed
// here against a fixture library.
//
// The other half is drift. QUERY_SCHEMA is what the panel TELLS people the
// tables hold, and the row builders are what they actually hold; the two are
// written in different places, so the first test below asserts they agree.

const GAME_DEFAULTS: Omit<Game, "id" | "name" | "system"> = {
  genres: [],
  platforms: [],
  releaseDate: "",
  imageUrl: "",
  igdbId: null,
  rating: "",
  lastPlayed: "",
  currentlyPlaying: false,
  playingSince: "",
  openSessionId: null,
  sessionCount: 0,
};

const games: Game[] = [
  {
    ...GAME_DEFAULTS,
    id: 1,
    name: "The Stanley Parable",
    system: "PC (Microsoft Windows)",
    genres: ["Adventure", "Puzzle"],
    platforms: ["PC (Microsoft Windows)", "Nintendo Switch"],
    releaseDate: "2013-10-17",
    igdbId: 4321,
    rating: "Great",
    lastPlayed: "2026-09-02",
    sessionCount: 1,
  },
  {
    ...GAME_DEFAULTS,
    id: 2,
    name: "Hades II",
    system: "Nintendo Switch",
    genres: ["Roguelike"],
    releaseDate: "2024-05-06",
    igdbId: 9876,
    rating: "Perfect",
    currentlyPlaying: true,
    playingSince: "2026-07-01",
    openSessionId: 30,
    sessionCount: 2,
  },
  // Unrated, hand-entered, never played: the row every NULL-handling branch
  // above has to survive.
  { ...GAME_DEFAULTS, id: 3, name: "Some Shovelware", system: "Wii" },
];

const sessions: PlaySession[] = [
  { id: 30, gameId: 2, startDate: "2026-07-01", endDate: null },
  { id: 20, gameId: 1, startDate: "2026-09-02", endDate: "2026-09-02" },
  { id: 10, gameId: 2, startDate: "2026-05-10", endDate: "2026-05-20" },
  // A session whose game is no longer in the library.
  { id: 5, gameId: 99, startDate: "2025-01-01", endDate: "2025-01-03" },
];

const wishlist: WishlistGame[] = [
  {
    name: "Silksong",
    system: "",
    genres: [],
    platforms: [],
    releaseDate: "",
    imageUrl: "",
    igdbId: null,
    id: 7,
    starred: true,
    dateAdded: "2026-04-01",
    notes: "wait for a sale",
  },
  {
    name: "Pikmin 4",
    system: "Nintendo Switch",
    genres: ["Strategy"],
    platforms: ["Nintendo Switch"],
    releaseDate: "2023-07-21",
    imageUrl: "",
    igdbId: 111,
    id: 8,
    starred: false,
    dateAdded: "2026-01-15",
    notes: "",
  },
];

const tables = buildQueryTables(games, sessions, wishlist);

/** Load the fixture into AlaSQL the way the panel does, then run `sql`. */
function run(sql: string): Record<string, unknown>[] {
  for (const [name, rows] of Object.entries(tables)) {
    alasql(`DROP TABLE IF EXISTS ${name}`);
    alasql(`CREATE TABLE ${name}`);
    alasql.tables[name].data = rows.map((row) => ({ ...row }));
  }
  const result = alasql(sql);
  return Array.isArray(result) ? result : [];
}

// --- Schema and rows agree -------------------------------------------------

test("every documented table exists and its columns match the rows built", () => {
  for (const table of QUERY_SCHEMA) {
    const rows = tables[table.name];
    assert.ok(rows !== undefined, `${table.name} is documented but never built`);
    assert.ok(rows.length > 0, `${table.name} has no fixture row to check columns against`);

    const documented = table.columns.map((c) => c.name).sort();
    const actual = Object.keys(rows[0]).sort();
    assert.deepEqual(actual, documented, `${table.name} columns drifted from QUERY_SCHEMA`);
  }
});

test("every built table is documented", () => {
  const documented = new Set(QUERY_SCHEMA.map((t) => t.name));
  for (const name of Object.keys(tables) as (keyof QueryTables)[]) {
    assert.ok(documented.has(name), `${name} is built but missing from QUERY_SCHEMA`);
  }
});

// --- Every query the UI can fire actually returns something ----------------

test("every column chip runs and keeps its column", () => {
  for (const table of QUERY_SCHEMA) {
    for (const column of table.columns) {
      const rows = run(distinctQuery(table.name, column.name));
      assert.ok(rows.length > 0, `${table.name}.${column.name} returned no rows`);
      // The AlaSQL failure this guards: an aggregate or expression it cannot
      // evaluate comes back as a row with the column silently absent.
      assert.ok(column.name in rows[0], `${table.name}.${column.name} was dropped from the result`);
    }
  }
});

test("every example query runs and returns its selected columns", () => {
  for (const example of EXAMPLE_QUERIES) {
    const rows = run(example.sql);
    assert.ok(rows.length > 0, `example "${example.label}" returned no rows`);

    // Aliases are what AlaSQL drops when it cannot compute them, so check that
    // each one named in the SELECT survived into the first row.
    for (const alias of [...example.sql.matchAll(/\bAS (\w+)/gi)].map((m) => m[1])) {
      assert.ok(alias in rows[0], `example "${example.label}" lost the "${alias}" column`);
    }
  }
});

// --- The derivations the panel's own numbers depend on ---------------------

test("start dates are derived from sessions, which Game itself cannot carry", () => {
  const byName = new Map(tables.games.map((row) => [row.name, row]));

  // The bug this whole section fixes: a one-day session ranks by when it
  // STARTED, not by an end date the closed-session field may not even hold.
  const stanley = byName.get("The Stanley Parable")!;
  assert.equal(stanley.last_started, "2026-09-02");
  assert.equal(stanley.first_started, "2026-09-02");
  assert.equal(stanley.days_played, 1);

  // Two sessions, the newer still open: first/last differ, and the open one
  // contributes no days.
  const hades = byName.get("Hades II")!;
  assert.equal(hades.first_started, "2026-05-10");
  assert.equal(hades.last_started, "2026-07-01");
  assert.equal(hades.days_played, 11);

  const never = byName.get("Some Shovelware")!;
  assert.equal(never.first_started, null);
  assert.equal(never.last_started, null);
  assert.equal(never.days_played, 0);
});

test("absent scalars become NULL rather than the wire format's empty string", () => {
  const never = tables.games.find((row) => row.name === "Some Shovelware")!;
  assert.equal(never.rating, null);
  assert.equal(never.rating_value, null);
  assert.equal(never.release_date, null);
  assert.equal(never.release_year, null);
  assert.equal(never.last_played, null);
  assert.equal(never.playing_since, null);

  const undecided = tables.wishlist.find((row) => row.name === "Silksong")!;
  assert.equal(undecided.system, null);
  assert.equal(undecided.release_date, null);
});

test("rating_value ranks S highest so AVG() means what it looks like", () => {
  const byName = new Map(tables.games.map((row) => [row.name, row]));
  assert.equal(byName.get("Hades II")!.rating, "S");
  assert.equal(byName.get("Hades II")!.rating_value, 4);
  assert.equal(byName.get("The Stanley Parable")!.rating, "A");
  assert.equal(byName.get("The Stanley Parable")!.rating_value, 3);
});

test("a session whose game left the library is dropped", () => {
  assert.equal(tables.sessions.length, 3);
  assert.ok(!tables.sessions.some((row) => row.game_id === 99));
});

test("a game with no genres still reaches the exploded table", () => {
  const shovelware = tables.game_genres.filter((row) => row.game_id === 3);
  assert.deepEqual(
    shovelware.map((row) => row.genre),
    ["Unknown"]
  );
  const silksong = tables.wishlist_genres.filter((row) => row.wishlist_id === 7);
  assert.deepEqual(
    silksong.map((row) => row.genre),
    ["Unknown"]
  );
});
