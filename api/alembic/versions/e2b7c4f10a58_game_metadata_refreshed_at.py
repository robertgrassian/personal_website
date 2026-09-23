"""Add game_metadata.refreshed_at — when the catalog row was last re-sourced.

The catalog stores facts that change after a game is added: a wishlisted game
with no announced release date gets one, a game ships on a new console, an
infobox genre is corrected. Until now those were only ever written once, at
add time, and the scripts/backfill_*.py repair tools were the only way to catch
up. This column is what lets a read notice a row has gone stale and re-source
it (app/services/catalog_refresh.py).

Existing rows are backfilled to created_at rather than to now(). Their values
were sourced when they were created, so created_at is the honest answer to
"when was this last checked" — and stamping now() instead would tell the
refresh that a two-year-old row is fresh, which is exactly backwards.

NOT NULL, with the same now() default created_at carries. A nullable column
would need a fallback for the NULL, and the only honest fallback is created_at
— which for any row inserted after this migration is set by its own default on
the same INSERT, so the fallback would return precisely what the default here
returns. One column with one meaning instead.

Revision ID: e2b7c4f10a58
Revises: d1a83f6c25e7
Create Date: 2026-09-01
"""

import sqlalchemy as sa

from alembic import op

revision = "e2b7c4f10a58"
down_revision = "d1a83f6c25e7"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Added nullable, backfilled, then tightened. Postgres 11+ fills existing
    # rows from the server default without rewriting the table, so those rows
    # briefly say now() before the UPDATE below corrects them to created_at --
    # which is why NOT NULL is set last rather than declared up front.
    op.add_column(
        "game_metadata",
        sa.Column(
            "refreshed_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=True,
        ),
    )
    op.execute("UPDATE game_metadata SET refreshed_at = created_at")
    op.alter_column("game_metadata", "refreshed_at", nullable=False)


def downgrade() -> None:
    op.drop_column("game_metadata", "refreshed_at")
