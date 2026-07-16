// Importing "server-only" causes a build error if this module is ever bundled
// into a client component — catches the mistake at build time, not runtime.
import "server-only";
import fs from "fs";
import path from "path";
import type { Session } from "./sessions";

// CSV schema (sessions.csv header):
// game,start_date,end_date
// Order matters — parseRow destructures by position. An empty end_date marks
// an open session (the game is currently being played). Names containing a
// comma are not supported (the naive split below would mis-parse a quoted
// field) — same limitation as gamesServer.ts; no current data hits it.

function parseRow(line: string, rowIndex: number): Session | null {
  // Split on comma and strip wrapping quotes — same approach as gamesServer.ts.
  const parts = line.split(",").map((p) => p.replace(/^"(.*)"$/, "$1"));
  if (parts.length < 2) {
    console.warn(`[sessions.csv] Row ${rowIndex}: skipping malformed line (too few columns)`);
    return null;
  }

  // `= ""` default handles rows missing the trailing end_date (open sessions
  // are often written with a trailing comma and nothing after it).
  const [rawGame, rawStartDate, rawEndDate = ""] = parts;

  const game = rawGame?.trim() ?? "";
  const startDate = rawStartDate?.trim() ?? "";
  const endDate = rawEndDate?.trim() ?? "";

  if (!game) {
    console.warn(`[sessions.csv] Row ${rowIndex}: skipping row with no game name`);
    return null;
  }

  return { game, startDate, endDate };
}

export function getSessions(): Session[] {
  const csvPath = path.join(process.cwd(), "sessions.csv");
  let raw: string;
  try {
    raw = fs.readFileSync(csvPath, "utf-8");
  } catch {
    // Fresh clones (or setups with no play log yet) don't have sessions.csv —
    // don't crash the page; derived play state just comes out empty.
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
