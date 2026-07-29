// Importing "server-only" causes a build error if this module is ever bundled
// into a client component — catches the mistake at build time, not runtime.
import "server-only";
import type { Game } from "./games";
import { fetchGamesFromApi, requireLibraryApiOrigin } from "./libraryApi";

// The library API (FastAPI/Postgres) is the only data source — the CSV read
// path this module used to hold was retired with the CSVs themselves (a
// frozen snapshot lives in api/scripts/fixtures/ as the local seed source).
// Play state (currentlyPlaying / lastPlayed / playingSince) arrives already
// derived by the API.
//
// `username` is required rather than defaulting to the /video-games owner:
// with /u/[username] there is no single right library to fall back to, and a
// silent default would be a bug that renders the wrong person's shelf.
export function getGames(username: string): Promise<Game[]> {
  return fetchGamesFromApi(requireLibraryApiOrigin(), username);
}
