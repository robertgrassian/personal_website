// Shared types for play sessions — no Node.js imports, safe for client and
// server components. Server-side CSV parsing lives in sessionsServer.ts.

// A single playthrough of a game, at playthrough granularity (NOT per-day).
// A session opens when you pick a game up and closes when you put it down.
// An open session (empty endDate) means the game is currently being played —
// this is the source of truth for "currently playing" and "last played",
// replacing the old currently_playing / last_played columns on games.csv.
export interface Session {
  game: string; // joins to Game.name (the only unique handle we have today)
  startDate: string; // ISO date, e.g. "2026-07-14"
  endDate: string; // ISO date, or "" while the session is still open (playing now)
}
