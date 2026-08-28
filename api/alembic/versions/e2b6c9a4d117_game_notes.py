"""Per-game free-text notes.

A table rather than a played_games column because the library read selects
whole PlayedGame entities: a column would load every note on every read of a
page that never displays one, and notes are deliberately long (20,000
characters, vs 1,000 for a wishlist note).

The UNIQUE on game_id is load-bearing beyond deduplication. It is what makes
"one note per game" the current shape of a table that can become timestamped
journal entries later by dropping it, and it gives the FK its index, so the
ON DELETE CASCADE's child lookup is not a sequential scan.

Revision ID: e2b6c9a4d117
Revises: d1a83f6c25e7
Create Date: 2026-08-24
"""

import sqlalchemy as sa

from alembic import op

revision = "e2b6c9a4d117"
down_revision = "d1a83f6c25e7"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "game_notes",
        sa.Column("id", sa.BigInteger(), sa.Identity(always=True), nullable=False),
        sa.Column("game_id", sa.BigInteger(), nullable=False),
        sa.Column("body", sa.Text(), server_default=sa.text("''"), nullable=False),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("id", name="pk_game_notes"),
        sa.ForeignKeyConstraint(
            ["game_id"],
            ["played_games.id"],
            name="fk_game_notes_game_id_played_games",
            ondelete="CASCADE",
        ),
        sa.UniqueConstraint("game_id", name="uq_game_notes_game_id"),
        # Spelled out rather than imported from app.models.game_note, matching
        # the baseline's hardcoded rating CHECK. A migration records what was
        # applied; importing a live constant makes it a view onto the current
        # one instead, so raising MAX_NOTE_LENGTH later would give a FRESH
        # database a different constraint from every migrated one, with no new
        # revision and nothing to catch it — `alembic check` does not compare
        # CHECK bodies. Changing the cap means writing a migration that alters
        # this constraint.
        #
        # op.f() marks the name as already final. Without it the "ck" naming
        # convention interpolates it AGAIN (ck_%(table_name)s_%(constraint_name)s)
        # and the constraint lands as ck_game_notes_ck_game_notes_body_length,
        # which the model would then not match. Only CheckConstraint needs this:
        # the pk/fk/uq conventions interpolate table and column names, not the
        # name given here, so those pass through untouched.
        sa.CheckConstraint("char_length(body) <= 20000", name=op.f("ck_game_notes_body_length")),
    )


def downgrade() -> None:
    op.drop_table("game_notes")
