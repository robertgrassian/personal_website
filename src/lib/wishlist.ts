// Shared types for the "want to play" wishlist — no Node.js imports, safe for
// client and server components. The server-side CSV parser lives in wishlistServer.ts.

import type { BaseGame } from "./baseGame";

// WishlistGame extends BaseGame with fields that only apply to games the user
// hasn't played yet. Notably absent: `rating` and `lastPlayed` (Game-only).
export interface WishlistGame extends BaseGame {
  starred: boolean; // priority sublist — "on my short list" games
  dateAdded: string; // ISO date, e.g. "2026-04-17" ("" if unknown)
  notes: string; // optional free text — why it's on the list, source, etc.
}

// Filters applicable to the wishlist view. Differs from `Filters` (games.ts)
// by omitting the rating filter (wishlist games haven't been rated yet).
export type WishlistFilters = {
  search: string;
  system: string; // "" = all systems
  genre: string; // "" = all genres
};
