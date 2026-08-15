# The four _backend_ structural refactors left over from the game-library simplification review.

_Section: **Backlog / Ideas** &middot; index: [`TODO.md`](../../TODO.md)_

Was nine; the five frontend ones landed on `tier3/frontend-refactors` (2026-08-07): `AddGameModal`
split at its `draft === null` seam, `GameShelves` extracted from `GameLibrary`, edit permission
moved to `LibraryEditingContext`, the founder special case hoisted out of `LibraryPage`, and the
per-keystroke render wins. Tiers 1 and 2 shipped earlier in PR #87. **Full write-ups for all nine
are in git history at commit `f0a0cbb`, `docs/game-library-simplification-backlog.md`.** Do the rest
one PR at a time, not as a batch. Note the backend items need the throwaway-Postgres test setup that
doc describes: a bare `uv run pytest` skips 173 tests, so a green run without `DATABASE_URL` proves
almost nothing. That Postgres also needs `api/scripts/ci_auth_schema.sql` loaded first, a stand-in
for the `auth.users`/`auth.identities` tables GoTrue owns everywhere else and that migration
`f985740c0df9` puts a real FK against; `.github/workflows/ci.yml` already does this and is the thing
to copy locally.

_The one carrying a real decision:_ `rate_limit_writes` commits its counter increment in its own
transaction, which under `NullPool` costs a second physical connect per write. Folding it into the
handler's transaction removes that — but the charge is committed separately _on purpose_, so it
survives a handler that raises. Fold it in and a failed write stops counting against the budget,
which is a rate-limit bypass. **Decided 2026-08-07: leave it alone**, because a caller who reliably
triggers a 500 would otherwise get unlimited attempts. Close this one by documenting why the extra
connect is paid, not by changing code. Reopen only with a measurement showing the connect actually
hurts.

_The other three:_ add a `CurrentProfile` FastAPI dependency so six `/me` routes stop re-fetching
the profile by hand, which also breaks the odd `services/follows.py` → `services/me.py` import (its
cost: the per-action wording, "adding games" vs "following people", is lost unless you parameterize
the dependency — that is user-facing copy, so decide deliberately); split `services/genres.py` (~620
lines) into a pure vocabulary module and a Wikipedia client, which is what
`scripts/backfill_genres.py` actually reaches into, with `services/igdb.py` having the identical
shape and fix; and, ranked last on purpose, deriving play state in SQL. `derive_play_state` is a
pure, unit-tested function (`tests/test_play_state.py`), and moving it into SQL trades Python you
can test for SQL you cannot, for six session rows across 155 games. If you touch it at all, take
only the cheap half — select the four columns instead of whole ORM objects.

_The non-optional `Game.id` / `sessionCount` / `openSessionId` follow-up shipped 2026-08-11_ and is
in Recently Completed; only the four backend items above are left here.
