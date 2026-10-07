"""Add game_metadata.platform_release_dates: one release date per platform.

release_date is IGDB's first_release_date, the earliest release on ANY
platform, so a Switch 2 port due a year after the PC original showed the PC
date on a Switch 2 wishlist entry. This column holds IGDB's per-platform dates,
and the read path picks the one matching the entry's system.

Existing rows start empty, which the read path treats as "use release_date",
i.e. today's behavior. scripts/backfill_release_dates.py fills them; the
catalog refresh keeps them current after that.

Revision ID: a7c3e91d5b20
Revises: e2b6c9a4d117
Create Date: 2026-10-07
"""

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision = "a7c3e91d5b20"
down_revision = "e2b6c9a4d117"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "game_metadata",
        sa.Column(
            "platform_release_dates",
            postgresql.JSONB(astext_type=sa.Text()),
            server_default=sa.text("'{}'::jsonb"),
            nullable=False,
        ),
    )


def downgrade() -> None:
    op.drop_column("game_metadata", "platform_release_dates")
