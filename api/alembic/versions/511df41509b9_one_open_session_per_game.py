"""One open session per game.

Partial unique index backing the "at most one open session per game"
invariant: the API's check-then-insert 409 can race under concurrent
"start playing" requests, and this index makes the DB the referee — the
losing insert gets a unique violation the service maps to the same 409.
Closed sessions (end_date NOT NULL) are unconstrained.

Revision ID: 511df41509b9
Revises: f985740c0df9
Create Date: 2026-07-23
"""

import sqlalchemy as sa

from alembic import op

revision = "511df41509b9"
down_revision = "f985740c0df9"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_index(
        "uq_play_sessions_one_open_per_game",
        "play_sessions",
        ["game_id"],
        unique=True,
        postgresql_where=sa.text("end_date IS NULL"),
    )


def downgrade() -> None:
    op.drop_index(
        "uq_play_sessions_one_open_per_game",
        table_name="play_sessions",
        postgresql_where=sa.text("end_date IS NULL"),
    )
