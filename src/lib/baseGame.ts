// Fields shared by played games and wishlist games. Both Game and WishlistGame
// extend this interface so shared UI (shelves, covers, filter bar) can accept
// either type via structural typing — no `implements` keyword needed in TS.

export interface BaseGame {
  name: string;
  system: string;
  genres: string[]; // CSV stores "Action-Adventure|Puzzle"; we split on "|"
  releaseDate: string; // ISO date string, e.g. "2023-05-12" ("" if unknown)
  imageUrl: string; // Populated by scripts/fetch-covers.ts; "" means show fallback
}

// Returns the game's genres, or ["Unknown"] if none are set.
// Use this wherever a game needs to appear once per genre (grouping, SQL expansion, etc.).
export function baseGameGenres(game: BaseGame): string[] {
  return game.genres.length > 0 ? game.genres : ["Unknown"];
}
