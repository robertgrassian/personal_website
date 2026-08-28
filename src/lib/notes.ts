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

// The same NUMBER as MAX_NOTE_LENGTH in api/app/models/game_note.py, which is
// the real bound (it also backs the DB CHECK). Duplicated here for the
// textarea's maxLength and the counter, so the limit is visible while typing
// rather than arriving as a 422 after a long write.
//
// Not the same UNIT, and the difference only ever errs safe. `maxLength` and
// `String.length` count UTF-16 code units; Python's len() and Postgres'
// char_length() count code points. Anything outside the BMP — emoji, most
// notably — is two units and one code point, so a note of 20,000 emoji is
// 40,000 here and 20,000 there: the browser stops you at half the allowance the
// server would grant. Tightening JS to match would mean counting graphemes,
// which is a dependency for a limit nobody reaches.
export const MAX_NOTE_LENGTH = 20_000;

// When the counter appears. Below this it is noise on a note nobody is near
// the limit of.
export const NOTE_COUNTER_THRESHOLD = MAX_NOTE_LENGTH - 2_000;
