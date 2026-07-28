// Importing "server-only" causes a build error if this module is ever bundled
// into a client component — catches the mistake at build time, not runtime.
import "server-only";
import type { LibraryProfile } from "./profile";
import { fetchProfileFromApi, requireLibraryApiOrigin } from "./libraryApi";

// null = no such user. Sibling of getGames()/getWishlist(), and the one a
// library page should await first: it settles whether the page exists at all
// before the shelves are worth fetching.
export function getProfile(username: string): Promise<LibraryProfile | null> {
  return fetchProfileFromApi(requireLibraryApiOrigin(), username);
}
