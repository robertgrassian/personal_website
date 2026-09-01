"""The shared game catalog.

One row = one game, as a fact about the game rather than about anyone's
library. Everything here is the same no matter who owns it: the title, the
cover art, the genres, the platforms it released on. The per-user tables
(played_games, wishlist_games) carry only what differs between users -- which
console *they* played it on, how *they* rated it, when *they* wishlisted it.

Two kinds of row live here, and igdb_id is what tells them apart:

  * ``igdb_id IS NOT NULL`` -- a SHARED row. IGDB's id is the canonical key, so
    every user who adds that game through search lands on this one row.
  * ``igdb_id IS NULL`` -- a PRIVATE row, owned by whoever typed the game in by
    hand (created_by_user_id). A manually entered game has no canonical key, so
    there is no honest way to decide that two users' "Tetris" are the same
    game, and guessing would mean one user's typo silently rewriting another's
    shelf.

That split is what lets the catalog be shared without needing an ownership or
moderation story: nothing in the UI can edit a shared row, and a private row is
only ever visible to its creator. If a private row is later matched to a
canonical one, merging is repointing link rows -- it touches no play session.
"""

import uuid
from datetime import date, datetime

from sqlalchemy import (
    BigInteger,
    Date,
    DateTime,
    ForeignKey,
    Identity,
    Index,
    Integer,
    Text,
    UniqueConstraint,
    Uuid,
    func,
    text,
)
from sqlalchemy.dialects.postgresql import ARRAY
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class GameMetadata(Base):
    """One row = one game, shared across every library that holds it."""

    __tablename__ = "game_metadata"

    id: Mapped[int] = mapped_column(BigInteger, Identity(always=True), primary_key=True)
    # NULL for hand-entered games. Postgres allows any number of NULLs under a
    # plain UNIQUE, which is exactly the semantics wanted: one shared row per
    # IGDB game, unlimited private rows.
    igdb_id: Mapped[int | None] = mapped_column(Integer)
    name: Mapped[str] = mapped_column(Text)
    # Every platform the game RELEASED on -- the catalog's fact, and what IGDB
    # already returns. Distinct from played_games.system, which is the one
    # console a particular user played it on. Keeping them apart is what makes
    # "which systems are allowable for this game?" answerable without asking
    # every user.
    platforms: Mapped[list[str]] = mapped_column(ARRAY(Text), server_default=text("'{}'::text[]"))
    genres: Mapped[list[str]] = mapped_column(ARRAY(Text), server_default=text("'{}'::text[]"))
    release_date: Mapped[date | None] = mapped_column(Date)
    image_url: Mapped[str | None] = mapped_column(Text)
    # NULL on shared rows, set on private ones. ON DELETE SET NULL rather than
    # CASCADE: a deleted account must not take a catalog row with it, since
    # another user's link row may since have been repointed at it.
    created_by_user_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("profiles.id", ondelete="SET NULL")
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    # When IGDB and Wikipedia were last asked about this row, so a read can tell
    # a checked-yesterday row from one nobody has looked at since 2024 (see
    # services/catalog_refresh.py). Defaults like created_at, which is the right
    # answer for a new row: the add path sources it on the way in.
    refreshed_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    __table_args__ = (
        UniqueConstraint("igdb_id", name="uq_game_metadata_igdb_id"),
        # One private row per (creator, name), so a user cannot accumulate two
        # catalog rows for the same hand-typed title. Partial, because shared
        # rows are keyed on igdb_id instead and two different IGDB games may
        # legitimately share a name.
        Index(
            "uq_game_metadata_creator_name",
            "created_by_user_id",
            "name",
            unique=True,
            postgresql_where=text("igdb_id IS NULL"),
        ),
    )
