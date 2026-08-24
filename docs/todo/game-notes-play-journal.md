# Give WISHLIST notes the editor that library games now have, and decide whether notes grow into a real play journal.

_Section: **Backlog / Ideas** &middot; index: [`TODO.md`](../../TODO.md)_

## What shipped 2026-08-24, so it is not re-derived

Library games have notes. The decisions, since each closes off an approach:

- **One free-text blob per game, not timestamped entries.** The want was "the md file I keep while
  playing" — a living document you rewrite, not an append-only log. Entries were not rejected, only
  deferred (see below).
- **Its own `game_notes` table**, not a `played_games` column. `repositories/users.py` selects whole
  `PlayedGame` entities, so a column loads every note on every library read. `UNIQUE(game_id)` is
  what says "one per game", so entries later means dropping a constraint, not migrating data.
- **Owner-only, and the one library read with no cache tag.** Notes never enter the cached public
  payload, so `saveGameNote` revalidates nothing on purpose. Do not "fix" that: it is only wrong if
  notes gain a public read.
- **20,000 characters** (`MAX_NOTE_LENGTH`, rendered into a DB CHECK), against 1,000 for a wishlist
  note. Blank saves DELETE the row, so "no note" has one representation.
- **Explicit Save, no autosave**, matching every other persisted edit in the directory. The
  data-loss risk autosave usually answers is covered instead by the draft outliving the editor
  (`useGameNote`) and an unsaved-changes guard on close.

## What is left

**1. The wishlist half.** `wishlist_games.notes` is still a 1,000-character column with a 2-row
textarea in `WishlistEditFields.tsx`, and it still rides the cached public `/users/*` payload. The
original item wanted both sides to behave the same. Deliberately not done in one pass: "wait for a
sale" is a label, not a journal, and moving it would be a breaking change to `WishlistGameRead` for
notes nobody writes at length.

`GameNotesEditor` already takes its state as one object, so pointing the wishlist at it is mostly
deciding whether wishlist notes stay public (leave the column, reuse the editor only) or become
owner-only like library notes (a second table and a payload change).

**2. Timestamped entries.** Still open, and now cheap to reach: drop `uq_game_notes_game_id`, add
`created_at` and probably a title. The real question is whether a dated entry should hang off
`play_sessions` instead — the session model already knows when you played, which would make this the
same screen as **Editing and deleting past sessions**. Do not build entries before that is decided;
two overlapping journals is the outcome to avoid.

**3. Markdown rendering.** Notes render as plain text with line breaks preserved. Deliberate: a
sanitizer is a dependency and an XSS surface, and `- [ ]` reads fine as plain text. Reconsider only
if the plain-text version is actually annoying in use.
