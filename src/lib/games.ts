import fs from "fs";
import path from "path";

// Rating is a TypeScript string union.
// "" is intentionally excluded: unrated games use Rating | "" at the field level,
// keeping Rating itself a clean set of real values.
export type Rating = "Perfect" | "Great" | "Good" | "Okay" | "Bad";

// Filters captures the active state of all filter controls in the game library UI.
// Defined here alongside Game and Rating so any component can import it without
// creating a circular dependency on the GameLibrary client component.
export type Filters = {
  search: string;
  rating: Rating | ""; // "" = no filter applied
  system: string; // "" = all systems
  genre: string; // "" = all genres
};

// Game is a plain data type.
export type Game = {
  name: string;
  system: string;
  rating: Rating | ""; // "" = no rating assigned yet
  genres: string[]; // CSV stores "Action-Adventure|Puzzle"; we split on "|"
  releaseDate: string; // ISO date string, e.g. "2023-05-12"
  firstPlayed: string; // Year string e.g. "2023", or "" if unknown
  imageUrl: string; // Populated by scripts/fetch-covers.ts; "" means show fallback
};

/**
 * Reads and parses games.csv from the project root.
 *
 * This function uses Node.js `fs` APIs, so it can only run server-side.
 * In Next.js App Router, we call it from a Server Component (page.tsx) —
 * no API route needed. The data then flows down as props to Client Components.
 */
export function getGames(): Game[] {
  const csvPath = path.join(process.cwd(), "games.csv");
  const raw = fs.readFileSync(csvPath, "utf-8");

  // Split into lines, skip the header row with an empty destructuring slot, keep the data rows.
  // The leading comma in `[, ...rows]` is how you skip an array element in destructuring.
  const [, ...rows] = raw.trim().split("\n");

  return rows
    .filter((line) => line.trim() !== "") // skip any trailing blank lines
    .map((line) => {
      // Simple comma-split works because this dataset has no commas inside values.
      // Genres use "|" as their delimiter instead, which is why we split them separately.
      // The `imageUrl = ""` default handles rows that don't yet have the 7th column.
      const [name, system, rating, genre, releaseDate, firstPlayed, imageUrl = ""] =
        line.split(",");

      return {
        name: name?.trim() ?? "",
        system: system?.trim() ?? "",
        rating: (rating?.trim() ?? "") as Rating | "",
        // "Action-Adventure|Puzzle" → ["Action-Adventure", "Puzzle"]
        genres: genre ? genre.split("|").map((g) => g.trim()) : [],
        releaseDate: releaseDate?.trim() ?? "",
        firstPlayed: firstPlayed?.trim() ?? "",
        imageUrl: imageUrl?.trim() ?? "",
      };
    });
}
