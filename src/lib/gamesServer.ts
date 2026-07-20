// Importing "server-only" causes a build error if this module is ever bundled
// into a client component — catches the mistake at build time, not runtime.
import "server-only";
import fs from "fs";
import path from "path";
import type { Game, Rating } from "./games";
import { RATINGS } from "./games";
import type { Session } from "./sessions";
import { getSessions } from "./sessionsServer";
import { fetchGamesFromApi, getLibraryApiOrigin } from "./libraryApi";

// /video_games is Robert's shelf at its stable URL (spec decision #5) — the
// read path always asks the API for this fixed user until multi-user routes
// (/u/[username], Phase 4) exist.
const LIBRARY_USERNAME = "rgrassian";

const VALID_RATINGS = new Set<string>(["", ...RATINGS.map((r) => r.name)]);

// Play state derived from a game's sessions. Replaces the old last_played /
// currently_playing CSV columns — an open session (empty endDate) means the
// game is being played now; the newest endDate is when it was last played.
type PlayState = {
  currentlyPlaying: boolean;
  lastPlayed: string;
  playingSince: string;
};

function derivePlayState(sessions: Session[]): PlayState {
  const open = sessions.filter((s) => s.endDate === "");
  // Newest end date across finished sessions. ISO dates sort lexically, so
  // reduce with localeCompare rather than parsing to Date objects.
  const lastPlayed = sessions
    .filter((s) => s.endDate !== "")
    .reduce((latest, s) => (s.endDate.localeCompare(latest) > 0 ? s.endDate : latest), "");
  // If several open sessions exist (unusual), take the most recent start.
  const playingSince = open.reduce(
    (latest, s) => (s.startDate.localeCompare(latest) > 0 ? s.startDate : latest),
    ""
  );
  return { currentlyPlaying: open.length > 0, lastPlayed, playingSince };
}

// Parses and validates a single CSV row. Logs warnings for fixable problems
// (bad rating, missing system) and returns the best-effort Game object.
// Only returns null if the row is completely unparseable or has no name.
function parseRow(line: string, rowIndex: number): Game | null {
  // Split on commas, then strip surrounding double-quotes from each field.
  // This handles fields that were unnecessarily quoted (e.g. "New Super Mario Bros.").
  // Note: this does not handle RFC 4180 edge cases like quoted fields containing commas;
  // none of the game names in our CSV contain commas, so this is sufficient.
  const parts = line.split(",").map((p) => p.replace(/^"(.*)"$/, "$1"));
  if (parts.length < 2) {
    console.warn(`[games.csv] Row ${rowIndex}: skipping malformed line (too few columns)`);
    return null;
  }

  // The `= ""` default handles rows missing the trailing image_url column.
  const [rawName, rawSystem, rawRating, rawGenre, rawReleaseDate, rawImageUrl = ""] = parts;

  const name = rawName?.trim() ?? "";
  const system = rawSystem?.trim() ?? "";
  let rating = rawRating?.trim() ?? "";
  const genres = rawGenre ? rawGenre.split("|").map((g) => g.trim()) : [];
  const releaseDate = rawReleaseDate?.trim() ?? "";
  const imageUrl = rawImageUrl?.trim() ?? "";

  if (!name) {
    console.warn(`[games.csv] Row ${rowIndex}: skipping row with no game name`);
    return null;
  }

  if (!system) {
    console.warn(`[games.csv] Row ${rowIndex}: "${name}" has no system`);
  }

  if (rating && !VALID_RATINGS.has(rating)) {
    console.warn(
      `[games.csv] Row ${rowIndex}: "${name}" has unrecognized rating "${rating}" — treating as unrated`
    );
    rating = "";
  }

  // Play-state fields (lastPlayed / currentlyPlaying / playingSince) are filled
  // in by getGames() from sessions.csv — parseRow only handles games.csv columns.
  return {
    name,
    system,
    rating: rating as Rating | "",
    genres,
    releaseDate,
    imageUrl,
    lastPlayed: "",
    currentlyPlaying: false,
    playingSince: "",
  };
}

// Async because the API branch awaits a fetch. The CSV branch is synchronous
// under the hood, but an async function wraps its return in a promise either
// way, so call sites `await` uniformly regardless of which branch ran.
export async function getGames(): Promise<Game[]> {
  // Env-gated branch (spec §8 Phase 1): LIBRARY_API_ORIGIN set → read from the
  // FastAPI/Postgres path; unset → the original CSV path below, kept intact as
  // the fallback until Phase 3 proves parity. The API returns play state
  // (currentlyPlaying / lastPlayed / playingSince) already derived, so the
  // sessions merge below is CSV-branch-only.
  const apiOrigin = getLibraryApiOrigin();
  if (apiOrigin) {
    return fetchGamesFromApi(apiOrigin, LIBRARY_USERNAME);
  }

  const csvPath = path.join(process.cwd(), "games.csv");
  let raw: string;
  try {
    raw = fs.readFileSync(csvPath, "utf-8");
  } catch {
    throw new Error(`Could not read games.csv at ${csvPath}. Make sure the file exists.`);
  }

  // The leading comma in `[, ...rows]` skips the header row via destructuring.
  const [, ...rows] = raw.trim().split("\n");

  const games = rows
    .filter((line) => line.trim() !== "") // skip trailing blank lines
    .flatMap((line, i) => {
      const game = parseRow(line, i + 2); // +2: 1-indexed, skip header
      return game ? [game] : [];
    });

  // Group sessions by game name so each game's play state is one Map lookup.
  // Sessions join to games by exact name (the only unique handle we have).
  const sessionsByGame = new Map<string, Session[]>();
  for (const session of getSessions()) {
    const list = sessionsByGame.get(session.game);
    if (list) list.push(session);
    else sessionsByGame.set(session.game, [session]);
  }

  // Merge the derived play state onto each game. Games with no sessions keep
  // the parseRow defaults (not playing, no last-played date — honestly unknown).
  for (const game of games) {
    const sessions = sessionsByGame.get(game.name);
    if (sessions) {
      const { currentlyPlaying, lastPlayed, playingSince } = derivePlayState(sessions);
      game.currentlyPlaying = currentlyPlaying;
      game.lastPlayed = lastPlayed;
      game.playingSince = playingSince;
    }
  }

  return games;
}
