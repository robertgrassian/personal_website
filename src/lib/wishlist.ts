// Shared types for the wishlist — no Node.js imports, safe for client and
// server components. Server-side CSV parsing lives in wishlistServer.ts.

import type { BaseGame } from "./baseGame";

// Wishlist-only fields. No `rating` or `lastPlayed` (those are Game-only).
export interface WishlistGame extends BaseGame {
  // DB row id from the library API (optional at the type level for the same
  // shared-card reason as Game.id; always present on real API rows). Owner
  // edits (PATCH/DELETE /me/wishlist/{id}, promote) require it.
  id?: number;
  starred: boolean; // priority sublist
  dateAdded: string; // ISO date ("" if unknown)
  notes: string; // free text
}

// Payload for POST /me/wishlist — mirrors the API's WishlistCreate schema.
// Only `name` is required server-side; `system` may stay "" (undecided).
export interface NewWishlistItem {
  name: string;
  system: string;
  genres: string[];
  releaseDate: string | null;
  imageUrl: string; // "" or an https://images.igdb.com/ URL
  igdbId: number | null;
  starred: boolean;
  dateAdded: string; // browser-local YYYY-MM-DD (API default is UTC "today")
}

// Like `Filters` (games.ts) minus `rating` — wishlist games aren't rated.
export type WishlistFilters = {
  search: string;
  system: string; // "" = all systems
  genre: string; // "" = all genres
};
