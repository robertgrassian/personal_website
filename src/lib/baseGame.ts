// Fields common to Game and WishlistGame. Shared UI (shelves, cases, filter
// bar) accepts BaseGame so either type fits via TS structural typing.

export interface BaseGame {
  name: string;
  system: string;
  genres: string[]; // CSV stores "Action-Adventure|Puzzle"; split on "|"
  releaseDate: string; // ISO date, e.g. "2023-05-12" ("" if unknown)
  imageUrl: string; // populated by scripts/fetch-covers.ts; "" = fallback
}

// Returns game.genres or ["Unknown"]. Use when a game must appear once per genre.
export function baseGameGenres(game: BaseGame): string[] {
  return game.genres.length > 0 ? game.genres : ["Unknown"];
}
