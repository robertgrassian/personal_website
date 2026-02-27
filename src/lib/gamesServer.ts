// Server-only — uses Node.js `fs`. Import only from Server Components.
import fs from "fs";
import path from "path";
import type { Game, Rating } from "./games";

export function getGames(): Game[] {
  const csvPath = path.join(process.cwd(), "games.csv");
  let raw: string;
  try {
    raw = fs.readFileSync(csvPath, "utf-8");
  } catch {
    throw new Error(`Could not read games.csv at ${csvPath}. Make sure the file exists.`);
  }

  // The leading comma in `[, ...rows]` skips the header row via destructuring.
  const [, ...rows] = raw.trim().split("\n");

  return rows
    .filter((line) => line.trim() !== "") // skip trailing blank lines
    .map((line) => {
      // Comma-split works because values never contain commas; genres use "|" instead.
      // The `imageUrl = ""` default handles rows missing the 7th column.
      const [name, system, rating, genre, releaseDate, firstPlayed, imageUrl = ""] =
        line.split(",");

      return {
        name: name?.trim() ?? "",
        system: system?.trim() ?? "",
        rating: (rating?.trim() ?? "") as Rating | "",
        genres: genre ? genre.split("|").map((g) => g.trim()) : [], // "Action|Puzzle" → ["Action", "Puzzle"]
        releaseDate: releaseDate?.trim() ?? "",
        firstPlayed: firstPlayed?.trim() ?? "",
        imageUrl: imageUrl?.trim() ?? "",
      };
    });
}
