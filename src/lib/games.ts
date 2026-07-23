// Shared types and constants — no Node.js imports, safe for client and server components.

import type { BaseGame } from "./baseGame";

// Re-export under the old name so existing `gameGenres` imports keep working.
export { baseGameGenres as gameGenres } from "./baseGame";

// Owner of the /video_games shelf. Client-safe on purpose: the server read
// path uses it as the API username, the browser uses it to decide whether the
// signed-in viewer owns this library (edit affordances), and write actions
// use it to build the cache tag to revalidate.
export const LIBRARY_OWNER_USERNAME = "rgrassian";

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
//
// `lastPlayed`, `currentlyPlaying`, and `playingSince` are all *derived* from
// sessions.csv (see sessionsServer.ts) in getGames() — they are no longer CSV
// columns on games.csv. An open session (empty end date) is the source of
// truth for "currently playing"; the newest end date is "last played".
export interface Game extends BaseGame {
  // DB row id — present only when the game came from the library API
  // (CSV rows have no id). Owner edits (PATCH /me/games/{id}) require it,
  // so edit affordances only render for API-backed games.
  id?: number;
  rating: Rating | ""; // "" = no rating assigned yet
  lastPlayed: string; // derived: newest session end date, or "" if none/only open
  currentlyPlaying: boolean; // derived: true when the game has an open session
  playingSince: string; // derived: start date of the open session, or "" if not playing
}
