// Importing "server-only" causes a build error if this module is ever bundled
// into a client component — catches the mistake at build time, not runtime.
import "server-only";
import fs from "fs";
import path from "path";
import type { Game, Rating } from "./games";
import { RATINGS } from "./games";

const VALID_RATINGS = new Set<string>(["", ...RATINGS.map((r) => r.name)]);

// Parses and validates a single CSV row. Logs warnings for fixable problems
// (bad rating, missing system) and returns the best-effort Game object.
// Only returns null if the row is completely unparseable or has no name.
function parseRow(line: string, rowIndex: number): Game | null {
  // Split on commas, then strip surrounding double-quotes from each field.
  // This handles fields that were unnecessarily quoted (e.g. "New Super Mario Bros.").
  // Note: this does not handle RFC 4180 edge cases like quoted fields containing commas;
  // none of the game names in our CSV contain commas, so this is sufficient.
  const parts = line.split(",").map((p) => p.replace(/^"(.*)"$/, "$1"));
  if (parts.length < 2) {
    console.warn(`[games.csv] Row ${rowIndex}: skipping malformed line (too few columns)`);
    return null;
  }

  // The `imageUrl = ""` default handles rows missing the 7th column.
  const [rawName, rawSystem, rawRating, rawGenre, rawReleaseDate, rawLastPlayed, rawImageUrl = ""] =
    parts;

  const name = rawName?.trim() ?? "";
  const system = rawSystem?.trim() ?? "";
  let rating = rawRating?.trim() ?? "";
  const genres = rawGenre ? rawGenre.split("|").map((g) => g.trim()) : [];
  const releaseDate = rawReleaseDate?.trim() ?? "";
  const lastPlayed = rawLastPlayed?.trim() ?? "";
  const imageUrl = rawImageUrl?.trim() ?? "";

  if (!name) {
    console.warn(`[games.csv] Row ${rowIndex}: skipping row with no game name`);
    return null;
  }

  if (!system) {
    console.warn(`[games.csv] Row ${rowIndex}: "${name}" has no system`);
  }

  if (rating && !VALID_RATINGS.has(rating)) {
    console.warn(
      `[games.csv] Row ${rowIndex}: "${name}" has unrecognized rating "${rating}" — treating as unrated`
    );
    rating = "";
  }

  return {
    name,
    system,
    rating: rating as Rating | "",
    genres,
    releaseDate,
    lastPlayed,
    imageUrl,
  };
}

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
    .flatMap((line, i) => {
      const game = parseRow(line, i + 2); // +2: 1-indexed, skip header
      return game ? [game] : [];
    });
}
