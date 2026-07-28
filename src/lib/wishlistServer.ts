// Importing "server-only" causes a build error if this module is ever bundled
// into a client component — catches the mistake at build time, not runtime.
import "server-only";
import type { WishlistGame } from "./wishlist";
import { fetchWishlistFromApi, requireLibraryApiOrigin } from "./libraryApi";

// API-only, same as getGames() — the wishlist.csv path was retired with the
// CSVs (frozen snapshot in api/scripts/fixtures/). `username` is required for
// the same reason it is there.
export function getWishlist(username: string): Promise<WishlistGame[]> {
  return fetchWishlistFromApi(requireLibraryApiOrigin(), username);
}
