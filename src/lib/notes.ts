// Shared types for per-game notes — no Node.js imports, safe for client and
// server components.
//
// Unlike every other library resource, notes have NO public read: they are
// served only from /me (api/app/routers/me.py), so there is nothing in
// libraryApi.ts for them and no cache tag. See useGameNote.ts for why that
// combination is deliberate rather than an omission.

/** One game's notes. `updatedAt` is null exactly when nothing is saved, which
 *  is also how the API answers for a game whose note has never been written. */
export interface GameNote {
  body: string;
  updatedAt: string | null; // ISO-8601 UTC
}

// Mirrors MAX_NOTE_LENGTH in api/app/models/game_note.py, which is the real
// bound (it also renders the DB CHECK). Duplicated here for the textarea's
// maxLength and the character counter, so the limit is visible while typing
// instead of arriving as a 422 after a long write.
export const MAX_NOTE_LENGTH = 20_000;

// When the counter appears. Below this it is noise on a note nobody is near
// the limit of.
export const NOTE_COUNTER_THRESHOLD = MAX_NOTE_LENGTH - 2_000;
