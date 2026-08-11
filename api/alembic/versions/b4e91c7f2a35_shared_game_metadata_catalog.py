"""Normalize game metadata into a shared catalog.

Before this, `games` and `wishlist_items` each carried their own copy of a
game's name, genres, release date, cover art and igdb_id. With one user that is
just duplication between two tables; with many users it is the same game's
metadata copied into every library that holds it, and there is nowhere to store
a fact that belongs to the *game* rather than to a person.

After this, `game_metadata` holds the game and the two renamed link tables
(`played_games`, `wishlist_games`) hold only what differs between users: which
console they played it on, how they rated it, whether they starred it.

Two things this deliberately does NOT do:

  * `play_sessions.game_id` still points at the user's row, not at the catalog.
    A session is a fact about a person; a catalog FK would need user_id beside
    it, and the ON DELETE CASCADE that makes "remove from library" take the
    play history with it would be wrong in both directions against a shared
    row. The table rename carries the FK across untouched.
  * A library entry still carries a single `system`. One entry per game per
    user is now enforced by uq_played_games_user_id_metadata_id; allowing two
    consoles later means relaxing that key to include `system`, with no data
    rewrite.

Catalog identity: rows with an igdb_id are shared (Postgres allows any number
of NULLs under a plain UNIQUE); rows without one are private to whoever entered
them by hand, since a typed-in name is not a canonical key and guessing that
two users' "Tetris" are the same game would let one rewrite the other's shelf.

Production was backfilled before this ran, by a throwaway script since deleted
(`scripts/backfill_igdb_ids.py`, in git history at the commit that added this
file). It mattered because igdb_id was NULL on nearly every pre-existing row --
only the UI's IGDB search flow ever wrote it -- so without it this would have
extracted one private row per game per user and the catalog would share
nothing. Any database migrating from scratch after that point gets private
rows, which is correct but not what production looks like.

Revision ID: b4e91c7f2a35
Revises: c7d2e4a91b06
Create Date: 2026-08-10
"""

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision = "b4e91c7f2a35"
down_revision = "c7d2e4a91b06"
branch_labels = None
depends_on = None


# Rows that would collide under the new (user_id, metadata_id) key. Stricter
# than the old (user_id, name, system): the same game under two consoles used
# to be two legal rows and is now one. There are none today, but a migration
# that silently dropped a game would be far worse than one that refuses to run.
_COLLISION_SQL = """
    SELECT user_id::text, key, n FROM (
        SELECT user_id, igdb_id::text AS key, count(*) AS n
          FROM {table} WHERE igdb_id IS NOT NULL GROUP BY 1, 2
        UNION ALL
        SELECT user_id, name AS key, count(*) AS n
          FROM {table} WHERE igdb_id IS NULL GROUP BY 1, 2
    ) counted WHERE n > 1
"""


# Both tables' metadata columns as one set of candidate rows. `src` orders
# games before wishlist_items when nothing else separates them.
_SOURCED_SQL = """
    SELECT user_id, igdb_id, name, genres, release_date, image_url, 0 AS src
      FROM games WHERE {key} {predicate}
    UNION ALL
    SELECT user_id, igdb_id, name, genres, release_date, image_url, 1 AS src
      FROM wishlist_items WHERE {key} {predicate}
"""

# Prefer the copy carrying the most, since a NULL here shows up as missing
# cover art on every shelf that holds the game.
_RICHEST = "(image_url IS NULL), (release_date IS NULL), (cardinality(genres) = 0)"


def _guard_collisions(conn: sa.Connection) -> None:
    problems = []
    for table in ("games", "wishlist_items"):
        for user_id, key, count in conn.execute(sa.text(_COLLISION_SQL.format(table=table))):
            problems.append(f"  {table}: user {user_id} has {count} rows for {key!r}")
    if problems:
        raise RuntimeError(
            "Cannot create the (user_id, metadata_id) unique key: these rows would "
            "collapse into one entry, silently losing a rating and a play history.\n"
            + "\n".join(problems)
            + "\nMerge or delete them by hand, then re-run."
        )


def _guard_reverse_collisions(conn: sa.Connection) -> None:
    """The mirror of _guard_collisions, for going back down.

    The post-migration schema is stricter about SOME things and looser about
    others: nothing stops one user holding two entries whose catalog rows share
    a name (a shared row for a game's igdb_id plus a private row they typed in
    by hand). Restoring uq_games_user_id_name_system / uq_wishlist_items_user_id_name
    over that state fails -- but only AFTER the tables have been renamed and the
    columns re-added, leaving a half-migrated database. Check first.

    The app blocks this state (find_game_by_name in repositories/me.py), so it
    only arises from writes that bypassed it.
    """
    problems = []
    for table, keys in (("played_games", "m.name, g.system"), ("wishlist_games", "m.name")):
        rows = conn.execute(
            sa.text(f"""
            SELECT g.user_id::text, {keys.split(",")[0]}, count(*)
              FROM {table} g JOIN game_metadata m ON m.id = g.metadata_id
             GROUP BY g.user_id, {keys}
            HAVING count(*) > 1
        """)
        )
        problems += [f"  {table}: user {u} has {n} entries named {name!r}" for u, name, n in rows]
    if problems:
        raise RuntimeError(
            "Cannot restore the pre-catalog unique constraints: these rows would "
            "collide once the name moves back onto them.\n"
            + "\n".join(problems)
            + "\nRemove the duplicates by hand, then re-run."
        )


def upgrade() -> None:
    conn = op.get_bind()
    _guard_collisions(conn)

    op.create_table(
        "game_metadata",
        sa.Column("id", sa.BigInteger(), sa.Identity(always=True), nullable=False),
        # NULL = a hand-entered game with no canonical key; see the module
        # docstring for why those stay private to their creator.
        sa.Column("igdb_id", sa.Integer(), nullable=True),
        sa.Column("name", sa.Text(), nullable=False),
        # Every platform the game RELEASED on, as opposed to played_games.system,
        # which is the one console a given user played it on.
        sa.Column(
            "platforms",
            postgresql.ARRAY(sa.Text()),
            server_default=sa.text("'{}'::text[]"),
            nullable=False,
        ),
        sa.Column(
            "genres",
            postgresql.ARRAY(sa.Text()),
            server_default=sa.text("'{}'::text[]"),
            nullable=False,
        ),
        sa.Column("release_date", sa.Date(), nullable=True),
        sa.Column("image_url", sa.Text(), nullable=True),
        sa.Column("created_by_user_id", sa.Uuid(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        # SET NULL, not CASCADE: a deleted account must not take a catalog row
        # with it, since another user's link row may point at it.
        sa.ForeignKeyConstraint(
            ["created_by_user_id"],
            ["profiles.id"],
            name=op.f("fk_game_metadata_created_by_user_id_profiles"),
            ondelete="SET NULL",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_game_metadata")),
        sa.UniqueConstraint("igdb_id", name="uq_game_metadata_igdb_id"),
    )
    # One private row per (creator, name). Partial because shared rows are keyed
    # on igdb_id instead, and two different IGDB games may share a name.
    op.create_index(
        "uq_game_metadata_creator_name",
        "game_metadata",
        ["created_by_user_id", "name"],
        unique=True,
        postgresql_where=sa.text("igdb_id IS NULL"),
    )

    # Shared rows: one per igdb_id across both tables.
    #
    # DISTINCT ON keeps the first row per key, so the ORDER BY is what decides
    # which copy becomes canonical. Richness first, source second: a games row
    # is preferred over a wishlist row only as a tie-break, because preferring
    # it unconditionally blanks the cover art whenever the played copy predates
    # the IGDB search flow and the wishlisted one does not.
    conn.execute(
        sa.text(f"""
        INSERT INTO game_metadata (igdb_id, name, platforms, genres, release_date, image_url)
        SELECT DISTINCT ON (igdb_id)
               igdb_id, name, ARRAY[]::text[], genres, release_date, image_url
          FROM ({_SOURCED_SQL.format(key="igdb_id", predicate="IS NOT NULL")}) sourced
         ORDER BY igdb_id, {_RICHEST}, src, name
    """)
    )

    # Private rows: one per (user, name) with no igdb_id. A game and a wishlist
    # entry of the same name for the same user share one row -- they are the
    # same game, and the user is the only one who could say otherwise. Two
    # DIFFERENT users' hand-typed "Tetris" stay two rows, on purpose.
    conn.execute(
        sa.text(f"""
        INSERT INTO game_metadata
               (igdb_id, name, platforms, genres, release_date, image_url, created_by_user_id)
        SELECT DISTINCT ON (user_id, name)
               NULL, name, ARRAY[]::text[], genres, release_date, image_url, user_id
          FROM ({_SOURCED_SQL.format(key="igdb_id", predicate="IS NULL")}) sourced
         ORDER BY user_id, name, {_RICHEST}, src
    """)
    )

    # Seed platforms from the consoles people actually recorded. A weak
    # approximation of "every platform this released on" -- the real list comes
    # from IGDB -- but better than empty, and it is what the add form's system
    # suggestions would fall back to.
    conn.execute(
        sa.text("""
        UPDATE game_metadata m
           SET platforms = sub.platforms
          FROM (
            SELECT metadata.id AS mid,
                   array_agg(DISTINCT g.system ORDER BY g.system) AS platforms
              FROM games g
              JOIN game_metadata metadata
                ON (g.igdb_id IS NOT NULL AND metadata.igdb_id = g.igdb_id)
                OR (g.igdb_id IS NULL AND metadata.igdb_id IS NULL
                    AND metadata.created_by_user_id = g.user_id AND metadata.name = g.name)
             WHERE g.system <> ''
             GROUP BY metadata.id
          ) sub
         WHERE m.id = sub.mid
    """)
    )

    _link_table(
        conn,
        old="games",
        new="played_games",
        old_unique="uq_games_user_id_name_system",
        new_unique="uq_played_games_user_id_metadata_id",
    )
    _link_table(
        conn,
        old="wishlist_items",
        new="wishlist_games",
        old_unique="uq_wishlist_items_user_id_name",
        new_unique="uq_wishlist_games_user_id_metadata_id",
    )

    # The rename carried these across pointing at the old names; realign them
    # with the naming convention so autogenerate stays quiet.
    op.execute(
        "ALTER TABLE played_games RENAME CONSTRAINT ck_games_rating TO ck_played_games_rating"
    )
    op.execute(
        "ALTER TABLE played_games RENAME CONSTRAINT fk_games_user_id_profiles "
        "TO fk_played_games_user_id_profiles"
    )
    op.execute("ALTER INDEX pk_games RENAME TO pk_played_games")
    op.execute(
        "ALTER TABLE wishlist_games RENAME CONSTRAINT fk_wishlist_items_user_id_profiles "
        "TO fk_wishlist_games_user_id_profiles"
    )
    op.execute("ALTER INDEX pk_wishlist_items RENAME TO pk_wishlist_games")
    op.execute(
        "ALTER TABLE play_sessions RENAME CONSTRAINT fk_play_sessions_game_id_games "
        "TO fk_play_sessions_game_id_played_games"
    )


def _link_table(
    conn: sa.Connection, *, old: str, new: str, old_unique: str, new_unique: str
) -> None:
    """Turn one denormalized table into a link table pointing at game_metadata."""
    op.add_column(old, sa.Column("metadata_id", sa.BigInteger(), nullable=True))
    conn.execute(
        sa.text(f"""
        UPDATE {old} t
           SET metadata_id = m.id
          FROM game_metadata m
         WHERE (t.igdb_id IS NOT NULL AND m.igdb_id = t.igdb_id)
            OR (t.igdb_id IS NULL AND m.igdb_id IS NULL
                AND m.created_by_user_id = t.user_id AND m.name = t.name)
    """)
    )
    # Belt and braces: a NULL here would mean the join above missed a row, and
    # SET NOT NULL would fail with a message that does not say which.
    orphans = conn.execute(
        sa.text(f"SELECT count(*) FROM {old} WHERE metadata_id IS NULL")
    ).scalar()
    if orphans:
        raise RuntimeError(f"{orphans} {old} rows found no game_metadata row; aborting.")

    op.alter_column(old, "metadata_id", existing_type=sa.BigInteger(), nullable=False)
    op.drop_constraint(old_unique, old, type_="unique")
    for column in ("name", "genres", "release_date", "image_url", "igdb_id"):
        op.drop_column(old, column)

    op.rename_table(old, new)
    op.create_foreign_key(
        op.f(f"fk_{new}_metadata_id_game_metadata"), new, "game_metadata", ["metadata_id"], ["id"]
    )
    op.create_unique_constraint(new_unique, new, ["user_id", "metadata_id"])


def downgrade() -> None:
    conn = op.get_bind()
    _guard_reverse_collisions(conn)

    _unlink_table(
        conn,
        old="played_games",
        new="games",
        old_unique="uq_played_games_user_id_metadata_id",
        new_unique="uq_games_user_id_name_system",
        # The wishlist's `system` is nullable and so was never in its key.
        new_unique_columns=["user_id", "name", "system"],
    )
    _unlink_table(
        conn,
        old="wishlist_games",
        new="wishlist_items",
        old_unique="uq_wishlist_games_user_id_metadata_id",
        new_unique="uq_wishlist_items_user_id_name",
        new_unique_columns=["user_id", "name"],
    )

    op.execute("ALTER TABLE games RENAME CONSTRAINT ck_played_games_rating TO ck_games_rating")
    op.execute(
        "ALTER TABLE games RENAME CONSTRAINT fk_played_games_user_id_profiles "
        "TO fk_games_user_id_profiles"
    )
    op.execute("ALTER INDEX pk_played_games RENAME TO pk_games")
    op.execute(
        "ALTER TABLE wishlist_items RENAME CONSTRAINT fk_wishlist_games_user_id_profiles "
        "TO fk_wishlist_items_user_id_profiles"
    )
    op.execute("ALTER INDEX pk_wishlist_games RENAME TO pk_wishlist_items")
    op.execute(
        "ALTER TABLE play_sessions RENAME CONSTRAINT fk_play_sessions_game_id_played_games "
        "TO fk_play_sessions_game_id_games"
    )

    op.drop_index("uq_game_metadata_creator_name", table_name="game_metadata")
    op.drop_table("game_metadata")


def _unlink_table(
    conn: sa.Connection,
    *,
    old: str,
    new: str,
    old_unique: str,
    new_unique: str,
    new_unique_columns: list[str],
) -> None:
    """Copy the catalog's columns back onto a link table and un-rename it.

    Lossy in one direction only: platforms has no pre-catalog home and is
    dropped. Everything else round-trips.
    """
    op.rename_table(old, new)
    op.drop_constraint(old_unique, new, type_="unique")
    op.drop_constraint(op.f(f"fk_{old}_metadata_id_game_metadata"), new, type_="foreignkey")

    op.add_column(new, sa.Column("name", sa.Text(), nullable=True))
    op.add_column(
        new,
        sa.Column(
            "genres",
            postgresql.ARRAY(sa.Text()),
            server_default=sa.text("'{}'::text[]"),
            nullable=True,
        ),
    )
    op.add_column(new, sa.Column("release_date", sa.Date(), nullable=True))
    op.add_column(new, sa.Column("image_url", sa.Text(), nullable=True))
    op.add_column(new, sa.Column("igdb_id", sa.Integer(), nullable=True))
    conn.execute(
        sa.text(f"""
        UPDATE {new} t
           SET name = m.name, genres = m.genres, release_date = m.release_date,
               image_url = m.image_url, igdb_id = m.igdb_id
          FROM game_metadata m
         WHERE m.id = t.metadata_id
    """)
    )
    op.alter_column(new, "name", existing_type=sa.Text(), nullable=False)
    op.alter_column(new, "genres", existing_type=postgresql.ARRAY(sa.Text()), nullable=False)
    op.drop_column(new, "metadata_id")
    op.create_unique_constraint(new_unique, new, new_unique_columns)
