# Make library and wishlist entries fully editable, and keep the two edit modals 1:1.

_Section: **Backlog / Ideas** &middot; index: [`TODO.md`](../../TODO.md)_

**Changing which console an entry records is now the urgent half of this** (2026-08-10). Since the
catalog migration a library entry is unique on `(user_id, metadata_id)`, so adding a game you
already own on a second console is a 409 — and with `GameUpdate` still rating-only there is **no way
out of that 409 at all**. **That half shipped 2026-08-11**, so the 409 now
has an escape hatch and this item is back to being the broader "edit everything" want.

`GameUpdate` (`api/app/schemas/me.py`) now carries rating and system, and nothing else. **The two
modals stopped being 1:1 in the other direction** (2026-08-19): `EditGameModal` is now the only
field form. It edits rating, system and sessions behind ONE Save, and takes a promote subject, so
the wishlist side no longer has a system field or a promote step at all. Note name, genres, release date and cover
art now live on the **shared** `game_metadata` row, so editing those is a different and harder
question than editing `system`: a shared row is visible to everyone who owns that game, and nothing
in the UI edits one today by design. Editing metadata means deciding whether the edit forks a
private row, is restricted to private rows, or genuinely changes the game for everyone. **This item
now owns that question outright** (2026-08-14): the add form stopped offering catalog fields on IGDB
picks, so there is no write path to a shared row's name, genres or release date anywhere in the UI,
and a wrong genre can only be fixed by `scripts/backfill_genres.py`. `EditWishlistModal` supports
starred/notes/system plus promote and delete (`PATCH /api/library/me/wishlist/{id}`), and the promote
step is still the only place a wishlist item's system gets set.

_Want:_ edit essentially every field, with the same form wherever it appears. **Re-decide the "1:1
modals" framing first**: the wishlist dialog deliberately no longer duplicates the library's fields,
so "keep the two edit modals 1:1" may now be the wrong goal, and the question is whether starred and
notes should move INTO `EditGameModal` as wishlist-only fields rather than the reverse. Note also
that starred still writes on click while everything in the library dialog waits for Save, which is
the last per-field write left in either dialog.

_Work:_ extend `GameUpdate` past rating and system, following the same router → service → repository
path `update_game_system` took, and extend `WishlistUpdate` past starred/notes/system. The "lift the
shared field set into one component" half is largely done: `SessionDateFields` and `RequiredField`
are extracted, and `saveGameEdits` already batches a multi-field Save, so a new field is a key on
`GameEdits` plus a call in `editCalls`. Server Actions
in `video-games/actions.ts` doing the usual `revalidateTag(libraryCacheTag(...))`. Cover art edits
must keep `validate_igdb_image_url` (`GameCreate` restricts `imageUrl` to IGDB CDN URLs so nobody
uses their library as free image hosting) — an "edit image" field that accepts arbitrary URLs would
reopen exactly that, and the argument is stronger now that the field writes a shared row. Genre
editing here also unblocks **"Audit the genre vocabulary"**, which currently needs a one-off
script for want of a write path.
