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

NULL is still permitted and means the same thing as created_at (the refresh
falls back to it), so a row inserted by anything that does not know about this
column is treated as never refreshed rather than as permanently fresh.

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
    op.add_column(
        "game_metadata",
        sa.Column("refreshed_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.execute("UPDATE game_metadata SET refreshed_at = created_at")


def downgrade() -> None:
    op.drop_column("game_metadata", "refreshed_at")
