// Shared types and constants — no Node.js imports, safe for client and server components.

import type { BaseGame } from "./baseGame";

// Owner of the /video-games shelf, i.e. the founder — the seeded profile the
// fixed routes render. Client-safe on purpose: the server read path uses it as
// the API username, /video-games and /currently-playing use it to pick whose
// shelf to show, and onboarding uses it to build the cache tag to revalidate
// after the signup auto-follow.
//
// Mirrored on the backend as FOUNDER_USERNAME (api/app/core/config.py), which
// is the source of truth for signup auto-follow and the reserved-name list.
// Renaming one without the other silently breaks the fixed routes here or the
// auto-follow there, so change both together.
//
// It does NOT decide edit affordances: ownership is per-library and resolved
// per-viewer (see useIsOwner in FollowControls), since any user's library can be edited by
// its own owner.
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

// The label a rating-less game is filed under: the rating-filter option, the
// `groupBy: "rating"` shelf, and the stats histogram row all use this one string.
export const UNRATED_LABEL = "Unrated";

// Systems are stored under IGDB's platform names (migration
// d1a83f6c25e7), so that `system` and `game_metadata.platforms` speak one
// vocabulary and "did this game release on that console?" is a set membership
// test rather than a fuzzy match. A few of IGDB's names are poor shelf
// headings, so those — and only those — get a display label here.
//
// Display only. Never write one of these back, never compare against one, and
// never key CSS on one: `video-games.css` matches `[data-system="..."]` against
// the STORED name, and a rule written against the label silently never fires.
const SYSTEM_DISPLAY_LABELS: Record<string, string> = {
  "PC (Microsoft Windows)": "PC",
};

/** The shelf-facing name for a stored system. Unmapped systems pass through. */
export function systemLabel(system: string): string {
  return SYSTEM_DISPLAY_LABELS[system] ?? system;
}

// Deliberately NOT the same type as `Game["rating"]`, which stays `Rating | ""`.
// A game's rating is a value it has; a rating *filter* is a question you ask of
// it, and "show me the unrated ones" is a question you can't store on a row.
// Keeping them apart is what stops UNRATED_LABEL reaching the write path
// (updateGameRating, RatingPicker), where it isn't a legal rating.
export type RatingFilter = Rating | typeof UNRATED_LABEL | "";

// Defined here alongside Game/Rating to avoid a circular dependency on GameLibrary.
export type Filters = {
  search: string;
  rating: RatingFilter; // "" = no filter applied
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
  // DB row id from the library API. Owner edits (PATCH /me/games/{id}) target
  // it. Required, matching GameRead (api/app/schemas/users.py) where it is a
  // plain `int`: games only ever arrive from that endpoint, so a row without
  // an id is not a state this app can reach.
  id: number;
  rating: Rating | ""; // "" = no rating assigned yet
  lastPlayed: string; // derived: newest session end date, or "" if none/only open
  currentlyPlaying: boolean; // derived: true when the game has an open session
  playingSince: string; // derived: start date of the open session, or "" if not playing
  // Id of the open session, null when not playing. Closing a session
  // (PATCH /me/sessions/{id}) targets this id. `null` is the real "not
  // playing" value and is load-bearing; the field itself is always present.
  openSessionId: number | null;
  // Total play sessions (open + closed). The delete confirm uses it to say
  // how much history goes with the game.
  sessionCount: number;
}

// One candidate from GET /api/py/igdb/search — the add-game picker's row.
// Platforms/genres are IGDB's own names. The confirm step picks which shelf
// the game lands on, but cannot rewrite these: they become the shared catalog
// row every owner of the game reads.
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
