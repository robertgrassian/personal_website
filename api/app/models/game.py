"""Library games and their play sessions (spec §4.2, §4.3)."""

import uuid
from datetime import date, datetime

from sqlalchemy import (
    BigInteger,
    CheckConstraint,
    Date,
    DateTime,
    ForeignKey,
    Identity,
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

# DB backstop for the RATINGS list in src/lib/games.ts — two sources of truth
# by accepted design (spec §4.2): the API validates against the TS-shaped
# list, the constraint catches anything that slips past it.
RATING_CHECK_SQL = "rating IN ('Perfect','Great','Good','Okay','Bad')"


class Game(Base):
    """One row = one game in one user's library (denormalized by design)."""

    __tablename__ = "games"

    id: Mapped[int] = mapped_column(BigInteger, Identity(always=True), primary_key=True)
    user_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("profiles.id", ondelete="CASCADE")
    )
    name: Mapped[str] = mapped_column(Text)
    system: Mapped[str] = mapped_column(Text)
    # NULL = unrated; the CHECK only constrains non-NULL values.
    rating: Mapped[str | None] = mapped_column(Text)
    genres: Mapped[list[str]] = mapped_column(ARRAY(Text), server_default=text("'{}'::text[]"))
    release_date: Mapped[date | None] = mapped_column(Date)
    image_url: Mapped[str | None] = mapped_column(Text)
    # Set when the game is added via IGDB search; the hook for normalizing
    # into a shared catalog later, if ever.
    igdb_id: Mapped[int | None] = mapped_column(Integer)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    __table_args__ = (
        # Final name via the metadata naming convention: ck_games_rating.
        CheckConstraint(RATING_CHECK_SQL, name="rating"),
        # Same dedupe rule the CSV implies: one entry per (owner, name, system).
        UniqueConstraint("user_id", "name", "system", name="uq_games_user_id_name_system"),
    )


class PlaySession(Base):
    """A play session; the FK replaces the CSV's join-by-exact-name."""

    __tablename__ = "play_sessions"

    id: Mapped[int] = mapped_column(BigInteger, Identity(always=True), primary_key=True)
    # ON DELETE CASCADE: deleting a game takes its play history with it; the
    # delete UI warns with the session count first (spec §4.2).
    game_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("games.id", ondelete="CASCADE"))
    start_date: Mapped[date] = mapped_column(Date)
    # NULL = open session = "currently playing" (spec §4.3).
    end_date: Mapped[date | None] = mapped_column(Date)
