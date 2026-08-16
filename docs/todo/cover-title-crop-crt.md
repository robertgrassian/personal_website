# Detect where the title sits on a game cover, and crop the CRT picture so it is not cut off.

_Section: **Backlog / Ideas** &middot; index: [`TODO.md`](../../TODO.md)_

The TV screen is landscape and cover art is portrait, so `object-cover` throws away most of the
height. Today every game gets the **same** hardcoded crop: `object-cover
[object-position:center_22%]` on the `<Image>` inside `.crt-picture` (`src/components/crt/CrtTv.tsx`
— corrected 2026-08-11: this entry used to name `video_games/CurrentlyPlaying.tsx`, which is dead
code nothing imports. The same crop literal appears in both files, so edit the `crt/` one). 22% is a
guess that titles sit high; when they don't, the title is sliced.

_The framing that matters, per the ask:_ the goal is **not** to center the title. It is the smallest
shift that brings the title fully inside the visible band, so the rest of the key art keeps as much
screen as possible. That makes the output a single number per cover — a vertical `object-position`
percentage — and the algorithm "clamp the crop window to contain the title's bounding box, then stop
moving". Falls back to the current 22% when nothing is detected or the title is already contained.
Storing a percentage rather than a cropped derivative keeps `next/image` doing the resizing and
avoids a second copy of every cover.

_Do this offline, not in the browser._ Running detection per render would mean shipping a vision
model to the client and re-deciding the crop on every page load, for a value that never changes once
the art is known. The precedent is already here: cover art and genres are both populated by backfill
scripts (`scripts/fetch-covers.ts`, `scripts/backfill_genres.py`, with
`docs/genre-backfill-runbook.md` as the preview-then-apply habit). So this is a script plus a stored
column, run once over existing rows and once per new game on add.

_Which table is now settled._ The focal point is a fact about **the artwork**, not about a user, so
it belongs on `game_metadata` — the shared catalog row, which shipped 2026-08-10 — as one more
nullable column beside `image_url`. Computed once per cover rather than once per user who owns the
game, which is the whole reason to wait for the catalog rather than adding it to `games`. Same
reasoning says the stored value could serve `GameCaseBack`/`GameCase` later, not just the CRT.

_On the library choice, and this is the part to validate before committing:_ what is wanted is text
**detection** (bounding boxes), not OCR (reading characters). Full OCR on stylized game logos is
unreliable, and we do not care what the title says. Detection-only models (EAST, CRAFT and similar)
are the closer fit; `tesseract.js` and the Python Tesseract bindings are the obvious first hits but
are solving the harder problem. A hosted vision API would work too and adds a paid dependency and a
key for a one-off batch over ~155 covers, which seems like the wrong trade. **All of this is
reasoning from the outside — nothing here has been tried.** Spot-check whichever candidate on a
dozen real covers (a logo in a script font over busy art is the hard case) before wiring anything
up.

_Worth trying first, because it may be enough:_ IGDB cover art is heavily conventionalized, and a
crude signal like "the row band with the highest edge density in the top third" may place titles
about as well as a model, with no dependency at all. If a cheap heuristic gets most covers right,
the remaining handful can be a hand-set override column, which is also the escape hatch any
automated version needs anyway.
