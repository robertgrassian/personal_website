"""IGDB token cache and rate limits.

Two tables of serverless-shared state for the IGDB proxy — Postgres stands in
for the process memory serverless instances don't share:

- igdb_tokens: singleton row (CHECK id = 1) caching the Twitch app token so
  cold starts don't re-mint it.
- rate_limits: fixed-window counters keyed (user_id, bucket), upserted in
  place, so per-user limits hold across instances. No FK to profiles —
  limiting must also cover authenticated callers who haven't onboarded.

Revision ID: 8f881f29b261
Revises: 511df41509b9
Create Date: 2026-07-23
"""

import sqlalchemy as sa

from alembic import op

revision = "8f881f29b261"
down_revision = "511df41509b9"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "igdb_tokens",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("access_token", sa.Text(), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint("id = 1", name=op.f("ck_igdb_tokens_singleton")),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_igdb_tokens")),
    )
    op.create_table(
        "rate_limits",
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("bucket", sa.Text(), nullable=False),
        sa.Column("window_start", sa.DateTime(timezone=True), nullable=False),
        sa.Column("count", sa.Integer(), nullable=False),
        sa.PrimaryKeyConstraint("user_id", "bucket", name=op.f("pk_rate_limits")),
    )


def downgrade() -> None:
    op.drop_table("rate_limits")
    op.drop_table("igdb_tokens")
