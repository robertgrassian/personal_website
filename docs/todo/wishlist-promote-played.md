# Overhaul the wishlist promote flow: it is "played", not "bought".

_Section: **Backlog / Ideas** &middot; index: [`TODO.md`](../../TODO.md)_

Today `EditWishlistModal.tsx` offers "I bought it, move to library" and the promote step just asks
for a system (`WishlistPromote`), so the game arrives unrated: on its normal shelf, and under
`groupBy: "rating"` in the "Unrated" group. Two premises are wrong: moving to the library means you
_played_ it (which might be a current session or a past one), and a wishlist entry may be a game
already in the library that you want to replay.

_Want:_ rename the button to "Played, move to the library" and show it **only** when the game is not
already in the library. Either way, follow up with "Track a play session?". When the game is already
in the library and the move button is hidden, offer "Track a play session?" straight away.

_The wiring:_ the modal only receives `item` and `existingSystems` (`EditWishlistModal.tsx`), so "is
this already in the library?" needs the library names threaded in from `GameLibrary` (which has
`games` in hand) — and matching by name alone misfires on shared titles, which is settled now:
`igdbId` is on `Game` and `WishlistGame` as of 2026-08-14, and `ownedKey` (`GameSearchStep.tsx`) is
the key function to reuse rather than write a second one. Starting a session from here means
reaching the same `logSession` path `EditGameModal` uses.
