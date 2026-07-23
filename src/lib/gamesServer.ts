// Importing "server-only" causes a build error if this module is ever bundled
// into a client component — catches the mistake at build time, not runtime.
import "server-only";
import type { Game } from "./games";
import { LIBRARY_OWNER_USERNAME } from "./games";
import { fetchGamesFromApi, requireLibraryApiOrigin } from "./libraryApi";

// The library API (FastAPI/Postgres) is the only data source — the CSV read
// path this module used to hold was retired with the CSVs themselves (a
// frozen snapshot lives in api/scripts/fixtures/ as the local seed source).
// Play state (currentlyPlaying / lastPlayed / playingSince) arrives already
// derived by the API.
export function getGames(): Promise<Game[]> {
  return fetchGamesFromApi(requireLibraryApiOrigin(), LIBRARY_OWNER_USERNAME);
}
