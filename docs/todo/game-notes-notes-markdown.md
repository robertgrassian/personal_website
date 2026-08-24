# Give WISHLIST notes the editor that library games now have, and render notes as Markdown.

_Section: **Backlog / Ideas** &middot; index: [`TODO.md`](../../TODO.md)_

## What shipped 2026-08-24, so it is not re-derived

Library games have notes. The decisions, since each closes off an approach:

- **One free-text blob per game.** The want was "the md file I keep while playing" — a living
  document you rewrite, not an append-only log.
- **Its own `game_notes` table**, not a `played_games` column. `repositories/users.py` selects whole
  `PlayedGame` entities, so a column loads every note on every library read.
- **Owner-only, and the one library read with no cache tag.** Notes never enter the cached public
  payload, so `saveGameNote` revalidates nothing on purpose. Do not "fix" that: it is only wrong if
  notes gain a public read.
- **20,000 characters** (`MAX_NOTE_LENGTH`, rendered into a DB CHECK), against 1,000 for a wishlist
  note. Blank saves DELETE the row, so "no note" has one representation.
- **Explicit Save, no autosave**, matching every other persisted edit in the directory. The
  data-loss risk autosave usually answers is covered instead by the draft outliving the editor
  (`useGameNote`) and an unsaved-changes guard on close.

## Decided against: timestamped journal entries

**Ruled out 2026-08-24, by the person who would use it: no want and no plan for dated entries.**
Notes stay one blob per game. `uq_game_notes_game_id` therefore stops being a hedge and is simply
the shape. Do not re-propose entries, and do not propose hanging them off `play_sessions` either —
that was the interesting version and it went with the rest.

## What is left

**1. The wishlist half.** `wishlist_games.notes` is still a 1,000-character column with a 2-row
textarea in `WishlistEditFields.tsx`, and it still rides the cached public `/users/*` payload. The
original item wanted both sides to behave the same. Deliberately not done in one pass: "wait for a
sale" is a label, not a journal, and moving it would be a breaking change to `WishlistGameRead` for
notes nobody writes at length.

`GameNotesEditor` already takes its state as one object, so pointing the wishlist at it is mostly
**one decision**: do wishlist notes stay public (leave the column where it is, reuse the editor
only) or become owner-only like library notes (a second table and a payload change)?

**2. Markdown.** Notes render as plain text with line breaks preserved. The blocker is the WRITING
experience, not the rendering — measured 2026-08-24 rather than guessed:

- **Rendering is easy and safe.** `react-markdown` + `remark-gfm` is ~20 lines. Verified against a
  hostile note: `<script>` and `<img onerror>` come out **escaped as text**, and a
  `javascript:` link renders as `href=""`. No sanitizer, no `dangerouslySetInnerHTML`, no XSS
  surface. An earlier draft of this doc claimed the opposite; it was wrong.
  GFM also gets `- [ ]` rendered as real checkboxes, which is what the "next session" lists want.
- **The cost is the dependency, not the risk.** 46 KB gzipped and **103 packages** on a project with
  7 runtime dependencies. That is the thing to weigh.
- **What is NOT easy is the Obsidian-style live preview** that was asked for: markup hiding and
  rendering inline as you type is CodeMirror 6 with custom decorations, or a WYSIWYG editor
  (TipTap/Milkdown/Lexical) that is a far bigger dependency and has to round-trip Markdown back out
  losslessly. Neither is a good fit for a 420px card.

So there are three tiers, and only the middle one is in question:

| Tier                        | Effort  | Notes                                             |
| --------------------------- | ------- | ------------------------------------------------- |
| Plain text                  | shipped | where it is now                                   |
| Edit / Preview toggle       | ~1 hour | react-markdown, a toggle in the notes face header |
| Live preview, Obsidian-like | weeks   | CodeMirror 6 decorations, or a WYSIWYG round-trip |

Take the toggle only if the plain-text version turns out to be annoying in real use. Do not reach
for tier 3 without deciding the card is the right surface for it at all.
