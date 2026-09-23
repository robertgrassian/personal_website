# Add "owned" as a field to wishlist games

_Section: **Backlog / Ideas** &middot; index: [`TODO.md`](../../TODO.md)_

Marking a wishlist entry as owned without moving it. Today the only "I bought it" gesture is
**promote** (`POST /me/wishlist/{id}/promote`, `me_repo.promote_wishlist_item`), which creates the
`played_games` row and deletes the `wishlist_games` row in one transaction. That is the right move
for a game you now play, and the wrong one for a game you own but have not started, or one bought
as a gift: promoting it puts it on the shelf and loses the wishlist entry's `notes`, `starred` and
`date_added`.

_The product decision, before the migration._ Owned-but-still-wishlisted and promoted-to-library
are two states that overlap. Decide what the shelf shows for each, whether an owned wishlist entry
is still offered the promote button, and whether promote should clear the flag or is simply the
other path. Without that, the checkbox ships as a second, quieter way of saying the same thing.

_Boolean or a `labels` array._ A `owned BOOLEAN NOT NULL DEFAULT false` column is one migration and
one checkbox in `WishlistEditFields`. A `labels TEXT[]` (or a join table) generalizes to later ideas
(gift, preordered, lent out, physical vs digital) at the cost of a vocabulary decision now: who
defines the labels, whether they are free text or a fixed list, and what the filter bar does with
them. `pipeline.ts` filters on scalar fields today, so an array field is also a new filter shape,
not just a new column. The counter-argument for the boolean is that one known use case does not
justify a taxonomy, and adding `labels` later can subsume an `owned` column with a data migration.
The counter-argument against it is that **Show whether a wishlist game is on sale** is the second
consumer already, and it only ever asks the yes/no question.

_Cross-references._ **Show whether a wishlist game is on sale** reads this flag to decide which
entries are worth a price check. **Make library and wishlist entries fully editable** and
**Fold "+ Add to wishlist" into a single "+ Add game"** both touch the same wishlist form.
