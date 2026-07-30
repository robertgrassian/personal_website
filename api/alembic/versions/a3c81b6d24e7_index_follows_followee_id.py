"""Index follows.followee_id.

The composite PK already indexes (follower_id, followee_id), so "who does X
follow?" is covered. "Who follows X?" is not: Postgres can't use a composite
index to seek on its second column alone, so follower lists and follower
counts would sequentially scan follows. Both are on the page-render path for
every library once the social graph ships.

Revision ID: a3c81b6d24e7
Revises: 8f881f29b261
Create Date: 2026-07-30
"""

from alembic import op

revision = "a3c81b6d24e7"
down_revision = "8f881f29b261"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_index("ix_follows_followee_id", "follows", ["followee_id"])


def downgrade() -> None:
    op.drop_index("ix_follows_followee_id", table_name="follows")
