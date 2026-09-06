// The query tab's data model: a denormalized, deliberately STABLE view of the
// library that is not the database schema.
//
// The API normalizes a game across three tables (game_metadata + played_games +
// play_sessions) and reshapes them whenever the backend changes. Nothing here
// follows that. These five tables are a contract with whoever is typing SQL
// into the panel, built from the `Game`, `PlaySession` and `WishlistGame` types
// the app already holds, so a migration only reaches the query box if it
// removes a field from one of those.
//
// Two rules the row builders keep, because SQL semantics depend on them:
//   * An absent scalar is NULL, never "". The app's wire types use "" for
//     "unknown" (see the mirroring contract in api/schemas/users.py); `WHERE
//     release_date IS NULL` is the question a person actually asks.
//   * Anything worth grouping by gets its own column rather than a derived
//     expression, because AlaSQL's MAX()/MIN() silently DROP a string column
//     from the result. `last_started` exists for exactly that reason: without
//     it, "when did I last start this game" is MAX(start_date), which returns
//     rows with the column missing instead of an error.

// Relative, with the .ts extension, rather than the usual "@/" alias: node
// --test loads this module for queryTables.test.ts and resolves real paths, so
// a runtime import through the alias would fail there. Same reason as
// playingPicker.ts. tsconfig's allowImportingTsExtensions covers it.
import { RATINGS, type Game } from "../../lib/games.ts";
import type { WishlistGame } from "../../lib/wishlist.ts";
import { sessionLengthDays, type PlaySession } from "../../lib/sessions.ts";
import { baseGameGenres } from "../../lib/baseGame.ts";

// --- Row types ---

export type GameRow = {
  id: number;
  name: string;
  system: string;
  rating: string | null;
  rating_value: number | null;
  genres: string;
  platforms: string;
  release_date: string | null;
  release_year: number | null;
  igdb_id: number | null;
  session_count: number;
  first_started: string | null;
  last_started: string | null;
  last_played: string | null;
  days_played: number;
  currently_playing: boolean;
  playing_since: string | null;
};

export type SessionRow = {
  id: number;
  game_id: number;
  game_name: string;
  system: string;
  start_date: string;
  end_date: string | null;
  is_open: boolean;
  length_days: number | null;
};

export type WishlistRow = {
  id: number;
  name: string;
  system: string | null;
  genres: string;
  platforms: string;
  release_date: string | null;
  release_year: number | null;
  igdb_id: number | null;
  starred: boolean;
  date_added: string | null;
};

// One row per entry-genre pair, so a multi-genre game can be counted once per
// genre. Same shape for both collections; the id column is named after what it
// joins to.
export type GameGenreRow = { game_id: number; name: string; genre: string };
export type WishlistGenreRow = { wishlist_id: number; name: string; genre: string };

/** Every table the query box can see, keyed by its SQL name. */
export type QueryTables = {
  games: GameRow[];
  game_genres: GameGenreRow[];
  sessions: SessionRow[];
  wishlist: WishlistRow[];
  wishlist_genres: WishlistGenreRow[];
};

// --- Row builders ---

// RATINGS is ordered best to worst, so the index IS the rank: S=4 down to F=0.
// Derived rather than written out, so adding a sixth grade cannot leave the
// numeric scale behind.
const RATING_LETTER = new Map(RATINGS.map((r) => [r.name, r.letter]));
const RATING_VALUE = new Map(RATINGS.map((r, i) => [r.name, RATINGS.length - 1 - i]));

/** "" (the wire format's "unknown") to NULL (SQL's). */
function nullable(value: string): string | null {
  return value === "" ? null : value;
}

function releaseYear(releaseDate: string): number | null {
  const year = parseInt(releaseDate.slice(0, 4), 10);
  return isNaN(year) ? null : year;
}

// What the sessions say about one game, which `Game` itself cannot carry:
// it holds the newest END date and the OPEN session's start, so the date a
// finished playthrough began is only in the session rows.
type PlayAggregate = { firstStarted: string; lastStarted: string; daysPlayed: number };

function aggregateSessions(sessions: PlaySession[]): Map<number, PlayAggregate> {
  const byGame = new Map<number, PlayAggregate>();
  for (const session of sessions) {
    const existing = byGame.get(session.gameId);
    const days = sessionLengthDays(session) ?? 0;
    if (existing === undefined) {
      byGame.set(session.gameId, {
        firstStarted: session.startDate,
        lastStarted: session.startDate,
        daysPlayed: days,
      });
      continue;
    }
    // String compare, not Date: ISO YYYY-MM-DD sorts lexicographically.
    if (session.startDate < existing.firstStarted) existing.firstStarted = session.startDate;
    if (session.startDate > existing.lastStarted) existing.lastStarted = session.startDate;
    existing.daysPlayed += days;
  }
  return byGame;
}

function toGameRow(game: Game, played: PlayAggregate | undefined): GameRow {
  return {
    id: game.id,
    name: game.name,
    system: game.system,
    rating: game.rating === "" ? null : (RATING_LETTER.get(game.rating) ?? null),
    rating_value: game.rating === "" ? null : (RATING_VALUE.get(game.rating) ?? null),
    genres: game.genres.join(", "),
    platforms: game.platforms.join(", "),
    release_date: nullable(game.releaseDate),
    release_year: releaseYear(game.releaseDate),
    igdb_id: game.igdbId,
    // From the API, not from the sessions array: it is authoritative even
    // before the separate session fetch lands.
    session_count: game.sessionCount,
    first_started: played?.firstStarted ?? null,
    last_started: played?.lastStarted ?? null,
    last_played: nullable(game.lastPlayed),
    days_played: played?.daysPlayed ?? 0,
    currently_playing: game.currentlyPlaying,
    playing_since: nullable(game.playingSince),
  };
}

function toSessionRow(session: PlaySession, game: Game): SessionRow {
  return {
    id: session.id,
    game_id: session.gameId,
    game_name: game.name,
    system: game.system,
    start_date: session.startDate,
    end_date: session.endDate,
    is_open: session.endDate === null,
    length_days: sessionLengthDays(session),
  };
}

function toWishlistRow(item: WishlistGame): WishlistRow {
  return {
    id: item.id,
    name: item.name,
    system: nullable(item.system),
    genres: item.genres.join(", "),
    platforms: item.platforms.join(", "),
    release_date: nullable(item.releaseDate),
    release_year: releaseYear(item.releaseDate),
    igdb_id: item.igdbId,
    starred: item.starred,
    date_added: nullable(item.dateAdded),
    // No notes column, and not by omission: notes are private to their author
    // and are not on the public read this table is built from, so a viewer's
    // page never holds them. See WishlistGame in lib/wishlist.ts.
  };
}

/** Build every table from the three arrays the panel already holds.
 *
 *  `sessions` may be empty while the separate history fetch is in flight; the
 *  sessions table is then empty and the games table's `*_started` columns are
 *  NULL, which is why the panel says so rather than letting a query look
 *  answered. */
export function buildQueryTables(
  games: Game[],
  sessions: PlaySession[],
  wishlist: WishlistGame[]
): QueryTables {
  const played = aggregateSessions(sessions);
  const gamesById = new Map(games.map((game) => [game.id, game]));

  const sessionRows: SessionRow[] = [];
  for (const session of sessions) {
    const game = gamesById.get(session.gameId);
    // A session whose game has since been deleted: skipped so the table cannot
    // name a game the games table does not list.
    if (game !== undefined) sessionRows.push(toSessionRow(session, game));
  }

  return {
    games: games.map((game) => toGameRow(game, played.get(game.id))),
    game_genres: games.flatMap((game) =>
      baseGameGenres(game).map((genre) => ({ game_id: game.id, name: game.name, genre }))
    ),
    sessions: sessionRows,
    wishlist: wishlist.map(toWishlistRow),
    wishlist_genres: wishlist.flatMap((item) =>
      baseGameGenres(item).map((genre) => ({ wishlist_id: item.id, name: item.name, genre }))
    ),
  };
}

// --- Schema reference ---

export type SchemaColumn = { name: string; desc: string };
export type SchemaTable = {
  name: keyof QueryTables;
  /** One line, shown collapsed beside the table name. */
  summary: string;
  columns: SchemaColumn[];
};

export const QUERY_SCHEMA: readonly SchemaTable[] = [
  {
    name: "games",
    summary: "one row per game in the library",
    columns: [
      { name: "id", desc: "Library row id; joins to sessions.game_id and game_genres.game_id" },
      { name: "name", desc: "Game title" },
      { name: "system", desc: "The console this game was played on" },
      { name: "rating", desc: "S / A / B / C / F, or NULL if unrated" },
      { name: "rating_value", desc: "The same grade as a number, S=4 down to F=0, for AVG()" },
      { name: "genres", desc: 'Comma-separated; e.g. "Platform, Fighting". Empty if none known' },
      {
        name: "platforms",
        desc: "Comma-separated platforms the game RELEASED on, not just this one",
      },
      { name: "release_date", desc: "ISO date (YYYY-MM-DD) or NULL" },
      { name: "release_year", desc: "Year as an integer, e.g. 2024" },
      { name: "igdb_id", desc: "IGDB's id, or NULL for a game entered by hand" },
      { name: "session_count", desc: "How many play sessions the game has, open ones included" },
      {
        name: "first_started",
        desc: "Start date of the earliest session, or NULL if never played",
      },
      { name: "last_started", desc: "Start date of the newest session, or NULL if never played" },
      { name: "last_played", desc: "End date of the newest FINISHED session, or NULL" },
      { name: "days_played", desc: "Days across all finished sessions, counting both ends" },
      { name: "currently_playing", desc: "true while the game has an open session" },
      { name: "playing_since", desc: "Start date of the open session, or NULL if not playing" },
    ],
  },
  {
    name: "sessions",
    summary: "one row per play session",
    columns: [
      { name: "id", desc: "Session row id" },
      { name: "game_id", desc: "Joins to games.id" },
      { name: "game_name", desc: "Title of the game played, so simple queries need no join" },
      { name: "system", desc: "The console that game was played on" },
      { name: "start_date", desc: "ISO date the session began; always set" },
      { name: "end_date", desc: "ISO date it ended, or NULL while the session is open" },
      {
        name: "is_open",
        desc: "true while the session has no end date; several can be open at once",
      },
      { name: "length_days", desc: "Days covered, counting both ends, or NULL while open" },
    ],
  },
  {
    name: "game_genres",
    summary: "games exploded to one row per genre",
    columns: [
      { name: "game_id", desc: "Joins to games.id" },
      { name: "name", desc: "Game title" },
      { name: "genre", desc: 'A single genre; "Unknown" when the game has none' },
    ],
  },
  {
    name: "wishlist",
    summary: "one row per wishlist entry",
    columns: [
      { name: "id", desc: "Wishlist row id; joins to wishlist_genres.wishlist_id" },
      { name: "name", desc: "Game title" },
      { name: "system", desc: "Platform it would be bought on, or NULL if undecided" },
      { name: "genres", desc: "Comma-separated; empty if none known" },
      { name: "platforms", desc: "Comma-separated platforms the game released on" },
      { name: "release_date", desc: "ISO date (YYYY-MM-DD) or NULL" },
      { name: "release_year", desc: "Year as an integer, e.g. 2024" },
      { name: "igdb_id", desc: "IGDB's id, or NULL for an entry added by hand" },
      { name: "starred", desc: "true for the priority sublist" },
      { name: "date_added", desc: "ISO date the entry was wishlisted" },
    ],
  },
  {
    name: "wishlist_genres",
    summary: "wishlist exploded to one row per genre",
    columns: [
      { name: "wishlist_id", desc: "Joins to wishlist.id" },
      { name: "name", desc: "Game title" },
      { name: "genre", desc: 'A single genre; "Unknown" when the entry has none' },
    ],
  },
];

// --- Example queries ---

// AlaSQL reserves "count" and "total" as column aliases, so these use "cnt".
export const EXAMPLE_QUERIES: readonly { label: string; sql: string }[] = [
  {
    label: "Recently started",
    sql: `SELECT name, system, last_started
FROM games
WHERE last_started IS NOT NULL
ORDER BY last_started DESC
LIMIT 10`,
  },
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
    label: "Best genres",
    sql: `SELECT genre, ROUND(AVG(games.rating_value), 2) AS avg_rating, COUNT(*) AS cnt
FROM game_genres
INNER JOIN games ON games.id = game_genres.game_id
WHERE games.rating_value IS NOT NULL
GROUP BY genre
ORDER BY avg_rating DESC`,
  },
  {
    label: "Longest sessions",
    sql: `SELECT game_name, start_date, end_date, length_days
FROM sessions
WHERE length_days IS NOT NULL
ORDER BY length_days DESC
LIMIT 10`,
  },
  {
    label: "Play by year",
    sql: `SELECT SUBSTRING(start_date, 1, 4) AS yr, COUNT(*) AS cnt, SUM(length_days) AS days_played
FROM sessions
GROUP BY SUBSTRING(start_date, 1, 4)
ORDER BY yr DESC`,
  },
  {
    label: "Never played",
    sql: `SELECT name, system, release_year
FROM games
WHERE session_count = 0
ORDER BY name`,
  },
  {
    label: "Wishlist stars",
    sql: `SELECT name, system, release_year, date_added
FROM wishlist
WHERE starred = true
ORDER BY date_added DESC`,
  },
  {
    label: "Wishlist by genre",
    sql: `SELECT genre, COUNT(*) AS cnt
FROM wishlist_genres
GROUP BY genre
ORDER BY cnt DESC`,
  },
  {
    label: "Sample rows",
    sql: `SELECT *
FROM games
LIMIT 10`,
  },
];

/** The query a column chip runs: every distinct value in that column. */
export function distinctQuery(table: string, column: string): string {
  return `SELECT DISTINCT ${column}\nFROM ${table}\nORDER BY ${column}`;
}
