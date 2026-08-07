# Plan: index `play_sessions.game_id`

Status: **code complete; not yet applied to production.** The migration exists at
`api/alembic/versions/c7d2e4a91b06_index_play_sessions_game_id.py`, it is the
current Alembic head, and `app/models/game.py` declares the matching `Index`, so
`alembic check` reports no drift. Verified 2026-08-07 against a throwaway
Postgres 16: `alembic upgrade head` applies cleanly and the suite is green
(349 passed) afterwards.

**The only thing left is running it against production.** There is no code
decision outstanding; read the rest of this for the reasoning, then apply it the
same way as the other migrations.

## What the problem is

`play_sessions` has exactly two indexes today: the primary key on `id`, and
`uq_play_sessions_one_open_per_game`. That second one is **partial** — it is
declared `WHERE end_date IS NULL`, because its job is enforcing "at most one
open session per game".

Postgres can only use a partial index for a query whose own predicate implies
the index's predicate. Two things read this column, and neither says anything
about `end_date`:

**1. The library read.** `repositories/users.py` loads a user's whole play
history in one query:

```sql
SELECT ... FROM play_sessions WHERE game_id IN (<every game id in the library>)
```

With no usable index this is a sequential scan of `play_sessions` followed by an
array comparison per row. The table holds **every user's** sessions, so the work
grows with total site activity while the answer stays one library's worth.

**2. The cascade.** `play_sessions.game_id` is `ON DELETE CASCADE`. Every
`DELETE /me/games/{id}` makes Postgres go looking for child rows to delete, and
an unindexed foreign key means that lookup is a sequential scan. This is the
classic unindexed-FK trap, not anything peculiar to this schema.

## Why it is not urgent

The table currently has single-digit rows. A sequential scan over six rows is
free, and it will stay free for a long time. This is insurance, not a fix for
something that hurts today. The reason it is worth doing anyway is that it costs
one line, it only ever gets more valuable, and the cascade case is the kind of
thing that is invisible until a delete on a big table blocks.

## Does this conflict with the future normalized `games` table?

**No.** I checked this specifically, since it was the condition on doing the
work at all.

The planned change is a dedicated catalog `games` table that user libraries
reference by FK — today's `games` is denormalized, one row per (user, game),
and `app/models/game.py` already calls `igdb_id` "the hook for normalizing into
a shared catalog later".

The index is unaffected, for three reasons:

1. **An index is not part of the logical model.** It constrains nothing about
   how tables relate. It can be dropped, renamed, or replaced in the same
   migration that does the normalization, with no data implications.

2. **The query pattern survives the refactor.** A play session belongs to _a
   user's copy_ of a game, not to the catalog entry — "Robert played Hades II
   from March to May" is a fact about Robert's row, not about Hades II. So
   `play_sessions` keeps pointing at whatever the per-user table ends up being
   called (`library_entries`, `user_games`, …), and the library read still
   fetches sessions by that table's ids. Same query shape, same index need.

3. **A rename carries the index along.** If the column becomes
   `library_entry_id`, `ALTER TABLE ... RENAME COLUMN` keeps its indexes
   automatically. You would be left with a correct index under a stale name,
   fixable with a one-line `ALTER INDEX ... RENAME` in that same migration.

The only shape that would want something different is if `play_sessions` were
repointed at the **catalog** row plus a separate `user_id` — then you would want
a composite index on `(user_id, game_id)`. But you would still want `game_id`
indexed for the cascade, and you would be revisiting this table's indexes in
that migration regardless.

### One thing to actually watch in that future migration

This is about the **existing** index, not the new one, but it is worth writing
down while it is in view.

`uq_play_sessions_one_open_per_game` is unique on `(game_id) WHERE end_date IS
NULL`. If a future design ever points `play_sessions.game_id` at the shared
catalog, that constraint silently changes meaning from "one user can have one
open session per game" to **"only one user on the whole site can be playing this
game at a time"** — which would be a real bug, surfacing as a spurious 409 for
the second person to start a popular game. Keeping `play_sessions` attached to
the per-user row (point 2 above) avoids it entirely; that is another reason to
prefer that shape.

## The migration

```python
def upgrade() -> None:
    op.create_index("ix_play_sessions_game_id", "play_sessions", ["game_id"])

def downgrade() -> None:
    op.drop_index("ix_play_sessions_game_id", table_name="play_sessions")
```

Plain `CREATE INDEX`, matching the existing `ix_follows_followee_id` migration.
It takes a `SHARE` lock that blocks writes to `play_sessions` while it builds —
milliseconds at this size.

If the table were ever large enough for that lock to matter, the alternative is
`CREATE INDEX CONCURRENTLY`, which does not block writes but cannot run inside a
transaction. Alembic wraps migrations in one, so that version needs its own
migration using `with op.get_context().autocommit_block():`. Not worth it now.

The model in `app/models/game.py` declares the same index, so `alembic check`
stays clean.

## Applying it

```bash
cd api
uv run alembic upgrade head           # local first
uv run pytest                         # confirm green
```

Then against production, whatever the usual path is for the other migrations.

To confirm it is actually being used afterwards:

```sql
EXPLAIN ANALYZE
SELECT * FROM play_sessions WHERE game_id IN (1, 2, 3);
-- want: Bitmap Index Scan on ix_play_sessions_game_id
-- not:  Seq Scan on play_sessions
```

At tiny row counts Postgres will legitimately still choose a sequential scan —
it is cheaper than an index lookup for a handful of rows. That is correct
behavior, not a failed migration. `SET enable_seqscan = off` in a session will
show the planner can use the index if you want to confirm it exists and is
valid.

## Reverting

`uv run alembic downgrade -1`. Dropping an index is instant and loses no data.
