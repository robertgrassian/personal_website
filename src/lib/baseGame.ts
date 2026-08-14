// Fields common to Game and WishlistGame. Shared UI (shelves, cases, filter
// bar) accepts BaseGame so either type fits via TS structural typing.

export interface BaseGame {
  name: string;
  system: string;
  genres: string[]; // e.g. ["Action-Adventure", "Puzzle"]; [] if none known
  releaseDate: string; // ISO date, e.g. "2023-05-12" ("" if unknown)
  imageUrl: string; // IGDB cover URL; "" = fallback art
  // IGDB's id for the game, or null when it was entered by hand. This is the
  // catalog's identity: titles are not unique (five games are called "Star
  // Fox"), so anything asking "is this the same game?" compares ids and only
  // falls back to the name when there is no id to compare.
  igdbId: number | null;
}

// Returns game.genres or ["Unknown"]. Use when a game must appear once per genre.
export function baseGameGenres(game: BaseGame): string[] {
  return game.genres.length > 0 ? game.genres : ["Unknown"];
}
