// Importing "server-only" causes a build error if this module is ever bundled
// into a client component — catches the mistake at build time, not runtime.
import "server-only";
import type { UserSummary } from "./follows";
import {
  fetchFollowersFromApi,
  fetchFollowingFromApi,
  requireLibraryApiOrigin,
} from "./libraryApi";

// Siblings of getGames()/getWishlist()/getProfile(). Both lists are public
// data, so they are fetched server-side and cached with the rest of the page —
// unlike "am I following this person?", which is per-viewer and must resolve
// client-side after hydration.
export function getFollowers(username: string): Promise<UserSummary[]> {
  return fetchFollowersFromApi(requireLibraryApiOrigin(), username);
}

export function getFollowing(username: string): Promise<UserSummary[]> {
  return fetchFollowingFromApi(requireLibraryApiOrigin(), username);
}
