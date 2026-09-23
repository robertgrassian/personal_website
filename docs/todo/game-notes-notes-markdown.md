# Give WISHLIST notes the editor that library games now have, and render notes as Markdown.

_Section: **Backlog / Ideas** &middot; index: [`TODO.md`](../../TODO.md)_

## What shipped, so it is not re-derived

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
- **A third face of the detail card, committed by the card's one Save.** Reached by a Notes button
  in the row beside "View or add play history", so the details face gains no height; a
  three-line preview there was built first and cost ~100px a phone does not have
  (`docs/mobile-viewport.md` has the measurements). No autosave: the draft lives in the card
  (`useGameNote`), and a close with unsaved notes is refused with a prompt, which no other draft
  on the card gets because none of them is a page of typing.
- **Read through a Server Action (`getGameNote`)**, the same path wishlist notes use, not
  browser to FastAPI.

## Decided against: timestamped journal entries

**Ruled out 2026-08-24, by the person who would use it: no want and no plan for dated entries.**
Notes stay one blob per game. `uq_game_notes_game_id` therefore stops being a hedge and is simply
the shape. Do not re-propose entries, and do not propose hanging them off `play_sessions` either —
that was the interesting version and it went with the rest.

## What is left

**1. The wishlist half.** `wishlist_games.notes` is still a 1,000-character column with a 2-row
textarea in `WishlistEditFields.tsx`. The privacy question this used to hinge on is settled: since
#205 wishlist notes are owner-only too (`MyWishlistGameRead`, fetched per entry). What is left is
only whether they want the notes face as well, and "wait for a sale" is a label, not a journal, so
the answer may simply be no. `GameNotesFace` takes its state as one `NoteDraft`, so reuse is cheap
if it is yes.

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
