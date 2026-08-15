# Take a pass at the catalog rows whose `igdb_id` points at a variant, not the base game.

_Section: **Up Next** &middot; Promoted by request 2026-08-10. &middot; index: [`TODO.md`](../../TODO.md)_

Eleven on prod, surfaced by `backfill_platforms.py`'s guard: it skips any row where a console
someone actually owns the game on is absent from IGDB's platform list, which is strong evidence the
row was identified as the wrong IGDB entry. `Dead Cells` resolves to IGDB's **Dead Cells+** (Apple
Arcade, iOS only), `Super Mario 64` to the 3D All-Stars entry, `Luigi's Mansion` to the 3DS remake,
`Super Smash Bros. Brawl` to a Web browser entry, `Metroid Dread` to a PC one. The rest: Call of
Duty: Black Ops III, Disco Elysium, Grim Fandango, Hollow Knight, Pac-Man World 2, SpongeBob
SquarePants: Lights, Camera, Pants!.

_It is not only platforms, which is the part that is easy to miss._ The whole `game_metadata` row is
the variant's, so its genres, cover art and release date come from there too. Only the **name** was
protected: `KEEP_STORED` in the since-deleted `backfill_igdb_ids.py` stopped those titles being
renamed to the variant's, and left the id underneath alone.

_The latent multi-user problem, which is the real reason to fix it._ Another user adding one of
these through IGDB search resolves the **base game's** id, which is a different `game_metadata` row,
so one game ends up with two catalog rows and the sharing the catalog exists for silently stops
happening for exactly these titles.

_Read each one; some are IGDB being wrong rather than the id._ Pac-Man World 2 really did release on
GameCube and IGDB lists only PlayStation 2, so its id is right and there is nothing to repoint. The
guard cannot tell those two cases apart, which is why it skips rather than guesses.

_Fix shape:_ find the base game's `igdb_id`, then **repoint the link rows' `metadata_id`** at the
correct catalog row rather than editing `igdb_id` in place. Editing in place can collide with
`uq_game_metadata_igdb_id` if a row for the correct id already exists, and repointing is the merge
operation the catalog was designed for: it touches no play session, because `play_sessions.game_id`
points at the user's row. Re-run `backfill_platforms.py` afterwards and the skip list should shrink
to the genuine IGDB gaps.
