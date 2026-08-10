"""Normalize played_games.system / wishlist_games.system to IGDB's platform names.

Two problems, one cause. The stored systems were typed by hand over years, so
the same console appears under more than one name: 18 rows said "PS5" and 7
said "PlayStation 5". Shelves group by the exact string, so **PlayStation 5 was
rendering as two separate shelves**, and PlayStation 4 as two more. The per-console
colour table in video-games.css keys on the same strings and only had a rule for
"PS5", so the "PlayStation 5" rows also lost their colour.

The second problem is that game_metadata.platforms holds IGDB's names, so
"is this system one the game actually released on?" could not be asked without
a fuzzy mapping in between. Adopting IGDB's vocabulary for `system` too makes
that a set membership test.

Every name below was checked against IGDB's /platforms endpoint rather than
guessed. Eleven of the seventeen systems in use already matched exactly; only
these six needed changing, and two of them merge into a name already in use.

Display is a separate concern: "PC (Microsoft Windows)" is IGDB's name and a
poor shelf heading, so the frontend maps a small set of names for rendering
(systemLabel in src/lib/games.ts). The database keeps IGDB's spelling.

Safe to run out of lockstep with the deploy, unlike the catalog migration: old
code reading renamed rows shows the wrong console colour, not an error.

Revision ID: d1a83f6c25e7
Revises: b4e91c7f2a35
Create Date: 2026-08-10
"""

import sqlalchemy as sa

from alembic import op

revision = "d1a83f6c25e7"
down_revision = "b4e91c7f2a35"
branch_labels = None
depends_on = None


# stored name -> IGDB's name. Verified against IGDB /platforms 2026-08-10.
RENAMES = {
    "PS5": "PlayStation 5",
    "PS4": "PlayStation 4",
    "PS3": "PlayStation 3",
    "Nintendo Wii": "Wii",
    "Nintendo Wii U": "Wii U",
    "Computer": "PC (Microsoft Windows)",
}

_TABLES = ("played_games", "wishlist_games")


def _rewrite(conn: sa.Connection, mapping: dict[str, str]) -> None:
    for table in _TABLES:
        for old, new in mapping.items():
            conn.execute(
                sa.text(f"UPDATE {table} SET system = :new WHERE system = :old"),
                {"new": new, "old": old},
            )


def upgrade() -> None:
    _rewrite(op.get_bind(), RENAMES)


def downgrade() -> None:
    """Lossy, and deliberately so.

    "PS5" and "PlayStation 5" both existed before this ran and both became
    "PlayStation 5"; going back cannot know which rows were which, so it sends
    all of them to the shorter spelling. That restores a working schema, not the
    exact prior data — which is the honest trade for a normalization whose whole
    purpose was to collapse a distinction that never meant anything.
    """
    _rewrite(op.get_bind(), {new: old for old, new in RENAMES.items()})
