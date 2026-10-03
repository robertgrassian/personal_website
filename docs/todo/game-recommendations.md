# A Recommendations tab beside Played and Wishlist: an Upcoming row and a Released section.

_Section: **Backlog / Ideas** &middot; index: [`TODO.md`](../../TODO.md)_

The full design is the tech spec, [`docs/specs/recommendations.md`](../specs/recommendations.md).
This doc carries only what routing needs; the spec owns the detail, so do not restate it here.

_Decided 2026-10-03:_ every user with 10+ rated games gets them, on a public tab served by the
cached read path; Add to wishlist and Not interested ship in v1; no LLM in any role.

_The constraints that shape it:_ too few users for collaborative filtering, so it is
content-based. Candidates must come from IGDB, since `game_metadata` holds only games someone
already owns. scikit-learn is too large for the deployed function, so the math runs in a nightly
GitHub Actions job writing a `recommendations` table.

_Start with phase 1 of the spec_, a notebook plus the leave-one-out evaluation harness. It answers
whether clustering into taste modes beats plain nearest neighbours before any migration or UI exists.
