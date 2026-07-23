// Importing "server-only" causes a build error if this module is ever bundled
// into a client component — catches the mistake at build time, not runtime.
import "server-only";
import type { WishlistGame } from "./wishlist";
import { LIBRARY_OWNER_USERNAME } from "./games";
import { fetchWishlistFromApi, requireLibraryApiOrigin } from "./libraryApi";

// API-only, same as getGames() — the wishlist.csv path was retired with the
// CSVs (frozen snapshot in api/scripts/fixtures/).
export function getWishlist(): Promise<WishlistGame[]> {
  return fetchWishlistFromApi(requireLibraryApiOrigin(), LIBRARY_OWNER_USERNAME);
}
