# Give library games a "notes" field, like wishlist entries already have, then grow it into a real play journal.

_Section: **Backlog / Ideas** &middot; index: [`TODO.md`](../../TODO.md)_

Today notes exist only on the wishlist side: `wishlist_items.notes`
(`api/app/models/wishlist_item.py`, `max_length=1000` in `api/app/schemas/me.py`) with a 2-row
textarea plus a "Save notes" button in `EditWishlistModal.tsx`. The `games` table has no notes
column at all.

_The want:_ "when I play a game I usually keep an md file to track progress and write notes; I want
to do that from the site instead of another app." So the quick-entry textarea stays for one-liners,
and both modals also get a larger popup view for writing and reading properly. Wishlist behaves the
same, for simplicity.

_What makes it more than a column add:_ 1000 chars is a note, not a journal, so the cap needs
revisiting (and with it the per-user size story that `max_games` covers for rows). A
save-button-per-keystroke textarea is already the compromise on the wishlist side; a full-screen
editor wants explicit save/dirty handling and probably autosave. Decide early whether this is one
free-text blob or timestamped entries — the second is much closer to what an md file actually is,
and retrofitting it later means a migration. Related: the session model already knows when you
played, so dated entries could hang off `play_sessions` rather than the game row.
