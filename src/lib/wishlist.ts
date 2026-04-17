// Shared types for the wishlist — no Node.js imports, safe for client and
// server components. Server-side CSV parsing lives in wishlistServer.ts.

import type { BaseGame } from "./baseGame";

// Wishlist-only fields. No `rating` or `lastPlayed` (those are Game-only).
export interface WishlistGame extends BaseGame {
  starred: boolean; // priority sublist
  dateAdded: string; // ISO date ("" if unknown)
  notes: string; // free text
}

// Like `Filters` (games.ts) minus `rating` — wishlist games aren't rated.
export type WishlistFilters = {
  search: string;
  system: string; // "" = all systems
  genre: string; // "" = all genres
};
