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
// `lastPlayed`, `currentlyPlaying`, and `playingSince` are all *derived* by
// the API from play_sessions rows. An open session (no end date) is the source
// of truth for "currently playing"; the newest end date is "last played".
export interface Game extends BaseGame {
  // DB row id from the library API. Optional at the type level because the
  // shared card types (GameCaseInput) predate a guaranteed id; in practice
  // every API row carries one. Owner edits (PATCH /me/games/{id}) require it.
  id?: number;
  rating: Rating | ""; // "" = no rating assigned yet
  lastPlayed: string; // derived: newest session end date, or "" if none/only open
  currentlyPlaying: boolean; // derived: true when the game has an open session
  playingSince: string; // derived: start date of the open session, or "" if not playing
  // Id of the open session, null when not playing. Closing a session
  // (PATCH /me/sessions/{id}) targets this id.
  openSessionId?: number | null;
  // Total play sessions (open + closed). The delete confirm uses it to say
  // how much history goes with the game.
  sessionCount?: number;
}

// One candidate from GET /api/py/igdb/search — the add-game picker's row.
// Platforms/genres are IGDB's own names; the confirm step lets the owner
// edit them into this library's vocabulary before the game is created.
export interface IgdbSearchResult {
  igdbId: number;
  name: string;
  releaseDate: string; // ISO date or "" if IGDB has none
  platforms: string[];
  genres: string[];
  coverUrl: string; // "" = no cover on IGDB; fallback art renders instead
}

// Payload for POST /me/games — mirrors the API's GameCreate schema. Every
// IGDB-derived field is optional so manual entry works with name + system.
export interface NewGame {
  name: string;
  system: string;
  genres: string[];
  releaseDate: string | null; // ISO date or null
  imageUrl: string; // "" or an https://images.igdb.com/ URL
  igdbId: number | null;
  rating: Rating | ""; // "" = enters the library unrated
}

// Today's date in the browser's (or server's) local timezone as YYYY-MM-DD.
// Session writes send this explicitly: the API's own "today" default runs on
// UTC serverless clocks, which would date an evening session tomorrow.
export function localToday(): string {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}
