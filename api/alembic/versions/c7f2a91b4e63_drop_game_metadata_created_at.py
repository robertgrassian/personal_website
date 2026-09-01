"""Drop game_metadata.created_at, unmapped since e2b7c4f10a58.

Phase two of a split the backward-compatibility rule in docs/deployment.md
forced. The model stopped mapping this column when refreshed_at replaced it,
but the DROP could not ride that same deploy: the production build prerenders
/video-games against the API still running the OLD code, whose mapping still
SELECTed created_at, so dropping it would have failed the very build that
shipped the fix. Unmapping was the safe half. That code is now live and no
longer names the column, so this is the half that was waiting.

Nothing reads it: refreshed_at answers "when was this row last checked", and
created_by_user_id is the whole of the row's provenance.

Revision ID: c7f2a91b4e63
Revises: e2b7c4f10a58
Create Date: 2026-09-01
"""

import sqlalchemy as sa

from alembic import op

revision = "c7f2a91b4e63"
down_revision = "e2b7c4f10a58"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.drop_column("game_metadata", "created_at")


def downgrade() -> None:
    # Recreated with the shape it had, but not the values: those are gone the
    # moment upgrade() runs. Existing rows get now(), which is a lie no caller
    # can notice, since nothing has read this column since e2b7c4f10a58.
    op.add_column(
        "game_metadata",
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
    )
