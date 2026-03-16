// Shared types and constants — no Node.js imports, safe for client and server components.

// Single source of truth: all ratings in order, best to worst.
// `as const` locks in the literal types so Rating and RatingLetter can be derived from the data.
// Adding or renaming a rating only requires changing this array.
export const RATINGS = [
  { name: "Perfect", letter: "S", color: "#fbbf24" },
  { name: "Great", letter: "A", color: "#bbf7d0" },
  { name: "Good", letter: "B", color: "#bfdbfe" },
  { name: "Okay", letter: "C", color: "#fef3c7" },
  { name: "Bad", letter: "F", color: "#fecaca" },
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

export type Game = {
  name: string;
  system: string;
  rating: Rating | ""; // "" = no rating assigned yet
  genres: string[]; // CSV stores "Action-Adventure|Puzzle"; we split on "|"
  releaseDate: string; // ISO date string, e.g. "2023-05-12"
  firstPlayed: string; // Year string e.g. "2023", or "" if unknown
  imageUrl: string; // Populated by scripts/fetch-covers.ts; "" means show fallback
};
