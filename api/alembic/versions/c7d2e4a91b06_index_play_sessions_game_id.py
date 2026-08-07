"""Index play_sessions.game_id.

The only other index on play_sessions is uq_play_sessions_one_open_per_game,
which is PARTIAL (WHERE end_date IS NULL). Postgres can only use a partial
index for a query whose predicate implies the index's own, and neither of the
two things that read this column implies "end_date IS NULL":

1. The library read. repositories/users.py fetches a user's whole play history
   with `WHERE game_id IN (...)` over every game id in the library, which is a
   sequential scan of play_sessions plus an array comparison per row. The table
   holds EVERY user's sessions, so this scan grows with total site activity
   while the result stays one library's worth.

2. The cascade. play_sessions.game_id is ON DELETE CASCADE, so every
   DELETE /me/games/{id} makes Postgres look for child rows. An unindexed
   foreign key means that lookup is a sequential scan, always — this is the
   classic unindexed-FK trap rather than anything specific to this schema.

Cheap insurance rather than a live fire: the table is tiny today. It only gets
more valuable as sessions accumulate, and it is one line to revert.

Revision ID: c7d2e4a91b06
Revises: a3c81b6d24e7
Create Date: 2026-08-06
"""

from alembic import op

revision = "c7d2e4a91b06"
down_revision = "a3c81b6d24e7"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Plain CREATE INDEX, matching ix_follows_followee_id. It takes a SHARE
    # lock that blocks writes to play_sessions for the duration, which at this
    # table's size is milliseconds. If this table is ever large enough for that
    # to matter, the swap is CONCURRENTLY — which cannot run inside a
    # transaction, so it needs its own migration with
    # `with op.get_context().autocommit_block():`.
    op.create_index("ix_play_sessions_game_id", "play_sessions", ["game_id"])


def downgrade() -> None:
    op.drop_index("ix_play_sessions_game_id", table_name="play_sessions")
