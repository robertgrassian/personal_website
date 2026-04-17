// Importing "server-only" causes a build error if this module is ever bundled
// into a client component — catches the mistake at build time, not runtime.
import "server-only";
import fs from "fs";
import path from "path";
import type { WishlistGame } from "./wishlist";

// CSV schema (wishlist.csv header):
// name,system,genre,release_date,image_url,starred,date_added,notes
// Order matters — parseRow destructures by position. `notes` is last and may
// contain commas (free text); no other field may.

// Rejoining anything at this index or later preserves commas inside notes.
const NOTES_COL = 7;

function parseRow(line: string, rowIndex: number): WishlistGame | null {
  // Split on comma and strip wrapping quotes — same approach as gamesServer.ts.
  // No RFC 4180 support; the "no commas except in notes" invariant must hold.
  const parts = line.split(",").map((p) => p.replace(/^"(.*)"$/, "$1"));
  if (parts.length < 2) {
    console.warn(`[wishlist.csv] Row ${rowIndex}: skipping malformed line (too few columns)`);
    return null;
  }

  // Defaults handle rows missing trailing columns.
  const [
    rawName,
    rawSystem,
    rawGenre,
    rawReleaseDate,
    rawImageUrl = "",
    rawStarred = "",
    rawDateAdded = "",
  ] = parts;
  const rawNotes = parts.slice(NOTES_COL).join(",");

  const name = rawName?.trim() ?? "";
  const system = rawSystem?.trim() ?? "";
  const genres = rawGenre ? rawGenre.split("|").map((g) => g.trim()) : [];
  const releaseDate = rawReleaseDate?.trim() ?? "";
  const imageUrl = rawImageUrl?.trim() ?? "";
  const starred = rawStarred.trim().toLowerCase() === "true";
  const dateAdded = rawDateAdded?.trim() ?? "";
  const notes = rawNotes.trim();

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
    // Fresh clones don't have wishlist.csv yet — don't crash the page.
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
