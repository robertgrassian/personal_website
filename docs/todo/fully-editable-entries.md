# Make library and wishlist entries fully editable, and keep the two edit modals 1:1.

_Section: **Backlog / Ideas** &middot; index: [`TODO.md`](../../TODO.md)_

**Changing which console an entry records is now the urgent half of this** (2026-08-10). Since the
catalog migration a library entry is unique on `(user_id, metadata_id)`, so adding a game you
already own on a second console is a 409 — and with `GameUpdate` still rating-only there is **no way
out of that 409 at all**. **That half shipped 2026-08-11** — see Recently Completed — so the 409 now
has an escape hatch and this item is back to being the broader "edit everything" want.

`GameUpdate` (`api/app/schemas/me.py`) now carries rating and system, and nothing else;
`EditGameModal` has a system field with an explicit Save. Note name, genres, release date and cover
art now live on the **shared** `game_metadata` row, so editing those is a different and harder
question than editing `system`: a shared row is visible to everyone who owns that game, and nothing
in the UI edits one today by design. Editing metadata means deciding whether the edit forks a
private row, is restricted to private rows, or genuinely changes the game for everyone. **This item
now owns that question outright** (2026-08-14): the add form stopped offering catalog fields on IGDB
picks, so there is no write path to a shared row's name, genres or release date anywhere in the UI,
and a wrong genre can only be fixed by `scripts/backfill_genres.py`. `EditWishlistModal` supports
starred/notes/system plus promote and delete (`PATCH /api/py/me/wishlist/{id}`), and the promote
step is still the only place a wishlist item's system gets set.

_Want:_ edit essentially every field from either modal, with the same form in both. Keep only the
genuinely mode-specific bits apart: rating on the library side, starred on the wishlist side.

_Work:_ extend `GameUpdate` past rating and system, following the same router → service → repository
path `update_game_system` took, extend `WishlistUpdate` past starred/notes/system, then lift the
shared field set out of `EditGameModal` into one component both modals render, with Server Actions
in `video-games/actions.ts` doing the usual `revalidateTag(libraryCacheTag(...))`. Cover art edits
must keep `validate_igdb_image_url` (`GameCreate` restricts `imageUrl` to IGDB CDN URLs so nobody
uses their library as free image hosting) — an "edit image" field that accepts arbitrary URLs would
reopen exactly that, and the argument is stronger now that the field writes a shared row. Genre
editing here also unblocks **"Audit the genre vocabulary"**, which currently needs a one-off
script for want of a write path.
