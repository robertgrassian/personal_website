"""Produce tastings: what a user has eaten, once per item per calendar year.

Keyed on the auth user rather than on profiles, so tracking produce needs an
account and nothing else. The FK to auth.users exists here and not on the
SQLAlchemy model, exactly as profiles.id does it (f985740c0df9): env.py's
include_object filter keeps autogenerate from proposing to drop it.

The primary key leads with user_id, so it is also the index behind both the
"my tastings this year" read and the cascade's child lookup.

Revision ID: b8d4f1a2c6e3
Revises: a7c3e91d5b20
Create Date: 2026-11-13
"""

import sqlalchemy as sa

from alembic import op

revision = "b8d4f1a2c6e3"
down_revision = "a7c3e91d5b20"
branch_labels = None
depends_on = None

FK_NAME = "fk_produce_tastings_user_id_users"


def upgrade() -> None:
    op.create_table(
        "produce_tastings",
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("produce_slug", sa.Text(), nullable=False),
        sa.Column("year", sa.SmallInteger(), nullable=False),
        sa.Column("eaten_on", sa.Date(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("user_id", "produce_slug", "year", name="pk_produce_tastings"),
        # Bodies spelled out rather than imported from the model, and names
        # wrapped in op.f(): both for the reasons recorded in e2b6c9a4d117.
        sa.CheckConstraint(
            "produce_slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' AND char_length(produce_slug) <= 64",
            name=op.f("ck_produce_tastings_slug_format"),
        ),
        sa.CheckConstraint(
            "year = extract(year from eaten_on)",
            name=op.f("ck_produce_tastings_year_matches_eaten_on"),
        ),
        sa.CheckConstraint(
            "eaten_on >= DATE '2020-01-01'",
            name=op.f("ck_produce_tastings_eaten_on_floor"),
        ),
    )
    op.create_foreign_key(
        FK_NAME,
        source_table="produce_tastings",
        referent_table="users",
        local_cols=["user_id"],
        remote_cols=["id"],
        referent_schema="auth",
        ondelete="CASCADE",
    )


def downgrade() -> None:
    op.drop_table("produce_tastings")
