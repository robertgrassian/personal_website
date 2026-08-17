# Take a pass at the catalog rows whose `igdb_id` points at a variant, not the base game.

_Section: **Up Next** &middot; Promoted by request 2026-08-10. &middot; index: [`TODO.md`](../../TODO.md)_

**Applied to local 2026-08-17; what is left is prod.** `api/scripts/repoint_variant_rows.py`
carries a hand-audited candidate id per title and fixed all eleven rows locally, after which
`backfill_platforms.py`'s skip list went from eleven to zero. Remaining steps, in order:

1. `uv run python scripts/repoint_variant_rows.py --database-url "$PROD_URL"`. Twitch
   credentials come from the repo-root `.env` in every environment; the run prints which database
   it is pointed at. Read the preview: old id, new id, IGDB's name for it, the new platforms.
2. Re-run with `--apply`.
3. Delete the Persona 5 wishlist entry through the site, per the note below.
4. `backfill_platforms.py`, preview then `--apply`; the skip list should reach zero.
5. Redeploy, or the site keeps serving the old covers: `libraryApi.ts` fetches `force-cache` with
   tags and only a Server Action's `revalidateTag` clears them, which a direct DB write bypasses.

Prod was never touched from a session, so the preview may differ from the local run below. The
preview ends with a "WANT A LOOK" section listing only the rows where the script chose rather than
looked up: locally that was two of eleven.

_What the eleven were._ Verified against the local DB, whose ids match the ones prod's guard
flagged. Every pick is confirmed by the recorded console appearing in the new id's platform list:

| Game                      | was                    | now                              |
| ------------------------- | ---------------------- | -------------------------------- |
| Dead Cells                | 351296 Dead Cells+ iOS | 26855                            |
| Super Mario 64            | 229245 Switch port     | 1074                             |
| Luigi's Mansion           | 90109 3DS remake       | 2485                             |
| Super Smash Bros. Brawl   | 328674 Web browser     | 1628                             |
| Metroid Dread             | 323061 PC entry        | 15698                            |
| Hollow Knight             | 365702 Vita mod        | 14593                            |
| CoD: Black Ops III        | 136212 PS3/360 port    | 9509 (recorded on PS4)           |
| SpongeBob: Lights, Camera | 320418 PC port         | 2768                             |
| Pac-Man World 2           | 305269 PS2-only        | 4063 (the row that lists the GC) |
| Disco Elysium             | 26472 PC/Mac           | 141540 The Final Cut (PS5)       |
| Grim Fandango             | 181 the 1998 PC game   | 8682 Remastered (Switch)         |

The last three are judgement calls worth a second look in the preview. Pac-Man World 2 was written
up here as "IGDB being wrong, nothing to repoint"; it is not, there is simply a second IGDB row
covering the GameCube release. Disco Elysium and Grim Fandango are wishlisted on consoles the
original release never reached, so the only row that can honestly carry them is the
remaster/Final Cut, and both were renamed accordingly: "Disco Elysium: The Final Cut" and
"Grim Fandango Remastered".

_Names follow the verified id (decided 2026-08-17)._ Once an id has been hand-picked from the table
and confirmed against the recorded consoles, IGDB's name for it is the canonical name of that exact
game, so the row takes it. An earlier "adopt only when it extends ours" rule was string-matching
around a trust problem the id no longer has, and it also refused improvements like
"Halo CE" -> "Halo: Combat Evolved", which are wanted. Nine of the eleven were unaffected: their
name was already right and only the id was wrong.

_Persona 5 was a separate wart, now fixed on local._ Catalog row 74 (igdb 9927, correct) was
wishlisted on PlayStation 5, which the 2016 release never came to, so the guard flagged it and
refused to replace its seeded `['PlayStation 5']` platform list. The wishlist entry was deleted
(2026-08-17): Persona 5 Royal on Switch is the only one wanted, and it is a different catalog row
(109). `backfill_platforms.py` then corrected row 74 to PS3/PS4 on its own, and the skip list is
now empty. **Do the same on prod** by deleting the wishlist entry through the site rather than in
SQL, which revalidates the cache tag as a side effect.

_What the script deliberately does not do._ Genres are left alone on every row, even though they
came from the variant: replacing them with IGDB's would work against **Audit the genre vocabulary**,
which sources from Wikipedia. The script prints the affected titles as a list to feed that item.

_Verified_ on the local DB inside a rolled-back transaction: the in-place repoint
of all eleven, a forced merge (link rows moved, duplicate folded, its play sessions moved, emptied
catalog row deleted), and the refusal when one user has both rows open as "currently playing".
