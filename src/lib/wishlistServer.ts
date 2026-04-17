// Importing "server-only" causes a build error if this module is ever bundled
// into a client component — catches the mistake at build time, not runtime.
import "server-only";
import fs from "fs";
import path from "path";
import type { WishlistGame } from "./wishlist";

// CSV schema (wishlist.csv header):
// name,system,genre,release_date,image_url,starred,date_added,notes
//
// Order matters — parseRow destructures by position. If you add/reorder columns,
// update this file and wishlist.csv together.

function parseRow(line: string, rowIndex: number): WishlistGame | null {
  // Split on commas, then strip surrounding double-quotes from each field.
  // Same approach as gamesServer.ts — sufficient because none of our values contain commas.
  const parts = line.split(",").map((p) => p.replace(/^"(.*)"$/, "$1"));
  if (parts.length < 2) {
    console.warn(`[wishlist.csv] Row ${rowIndex}: skipping malformed line (too few columns)`);
    return null;
  }

  // Defaults handle rows missing trailing columns (e.g. no notes).
  const [
    rawName,
    rawSystem,
    rawGenre,
    rawReleaseDate,
    rawImageUrl = "",
    rawStarred = "",
    rawDateAdded = "",
    rawNotes = "",
  ] = parts;

  const name = rawName?.trim() ?? "";
  const system = rawSystem?.trim() ?? "";
  const genres = rawGenre ? rawGenre.split("|").map((g) => g.trim()) : [];
  const releaseDate = rawReleaseDate?.trim() ?? "";
  const imageUrl = rawImageUrl?.trim() ?? "";
  const starred = rawStarred.trim().toLowerCase() === "true";
  const dateAdded = rawDateAdded?.trim() ?? "";
  const notes = rawNotes?.trim() ?? "";

  if (!name) {
    console.warn(`[wishlist.csv] Row ${rowIndex}: skipping row with no game name`);
    return null;
  }

  if (!system) {
    console.warn(`[wishlist.csv] Row ${rowIndex}: "${name}" has no system`);
  }

  return {
    name,
    system,
    genres,
    releaseDate,
    imageUrl,
    starred,
    dateAdded,
    notes,
  };
}

export function getWishlist(): WishlistGame[] {
  const csvPath = path.join(process.cwd(), "wishlist.csv");
  let raw: string;
  try {
    raw = fs.readFileSync(csvPath, "utf-8");
  } catch {
    // Returning an empty list (instead of throwing) means the wishlist feature
    // still works on fresh clones before anyone has seeded the CSV.
    return [];
  }

  // The leading comma in `[, ...rows]` skips the header row via destructuring.
  const [, ...rows] = raw.trim().split("\n");

  return rows
    .filter((line) => line.trim() !== "") // skip trailing blank lines
    .flatMap((line, i) => {
      const entry = parseRow(line, i + 2); // +2: 1-indexed, skip header
      return entry ? [entry] : [];
    });
}
