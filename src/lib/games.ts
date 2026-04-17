// Shared types and constants — no Node.js imports, safe for client and server components.

import type { BaseGame } from "./baseGame";

// Re-export under the old name so existing `gameGenres` imports keep working.
export { baseGameGenres as gameGenres } from "./baseGame";

// Single source of truth: all ratings in order, best to worst.
// `as const` locks in the literal types so Rating and RatingLetter can be derived from the data.
// Adding or renaming a rating only requires changing this array.
export const RATINGS = [
  { name: "Perfect", letter: "S", color: "var(--rating-s)" },
  { name: "Great", letter: "A", color: "var(--rating-a)" },
  { name: "Good", letter: "B", color: "var(--rating-b)" },
  { name: "Okay", letter: "C", color: "var(--rating-c)" },
  { name: "Bad", letter: "F", color: "var(--rating-f)" },
] as const;

// "" is excluded from Rating so the type stays a clean set of real values;
// unrated games use `Rating | ""` at the field level.
export type Rating = (typeof RATINGS)[number]["name"];
export type RatingLetter = (typeof RATINGS)[number]["letter"];

// Excludes S, which gets RatingRibbon instead of RatingBadge.
export type BadgeRank = Exclude<RatingLetter, "S">;

// Defined here alongside Game/Rating to avoid a circular dependency on GameLibrary.
export type Filters = {
  search: string;
  rating: Rating | ""; // "" = no filter applied
  system: string; // "" = all systems
  genre: string; // "" = all genres
};

// Game = BaseGame + played-only fields. Shared UI uses BaseGame so both this
// and WishlistGame fit.
export interface Game extends BaseGame {
  rating: Rating | ""; // "" = no rating assigned yet
  lastPlayed: string; // ISO date string e.g. "2023-05-12", or "" if unknown
}
