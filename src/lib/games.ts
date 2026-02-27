// Shared types and constants — no Node.js imports, safe for client and server components.

// "" is excluded from Rating so the type stays a clean set of real values;
// unrated games use `Rating | ""` at the field level.
export type Rating = "Perfect" | "Great" | "Good" | "Okay" | "Bad";

// S/A/B/C/F display letters. Co-located with Rating so a future refactor
// (e.g. storing letters directly in the CSV) only touches this file.
export type RatingLetter = "S" | "A" | "B" | "C" | "F";

// Excludes S, which gets RatingRibbon instead of RatingBadge.
export type BadgeRank = Exclude<RatingLetter, "S">;

export const RATING_LETTER: Record<Rating, RatingLetter> = {
  Perfect: "S",
  Great: "A",
  Good: "B",
  Okay: "C",
  Bad: "F",
};

// Helvetica Neue for compact, distinct letterforms — separate from the site's Geist Sans.
export const RATING_FONT = "'Helvetica Neue', Arial, sans-serif";

// Defined here alongside Game/Rating to avoid a circular dependency on GameLibrary.
export type Filters = {
  search: string;
  rating: Rating | ""; // "" = no filter applied
  system: string; // "" = all systems
  genre: string; // "" = all genres
};

export type Game = {
  name: string;
  system: string;
  rating: Rating | ""; // "" = no rating assigned yet
  genres: string[]; // CSV stores "Action-Adventure|Puzzle"; we split on "|"
  releaseDate: string; // ISO date string, e.g. "2023-05-12"
  firstPlayed: string; // Year string e.g. "2023", or "" if unknown
  imageUrl: string; // Populated by scripts/fetch-covers.ts; "" means show fallback
};
