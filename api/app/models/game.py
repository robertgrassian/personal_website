"""A user's library entries and their play sessions.

The game itself -- name, cover, genres, release date -- lives once in
game_metadata. What is here is only what differs between users: which console
this user played it on, and how they rated it.
"""

import uuid
from datetime import date, datetime

from sqlalchemy import (
    BigInteger,
    CheckConstraint,
    Date,
    DateTime,
    ForeignKey,
    Identity,
    Index,
    Text,
    UniqueConstraint,
    Uuid,
    func,
    text,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base

# Python mirror of the RATINGS list in src/lib/games.ts — two sources of
# truth by accepted design: the API validates writes against this tuple and
# the DB CHECK below backstops anything that slips past it.
RATING_NAMES: tuple[str, ...] = ("Perfect", "Great", "Good", "Okay", "Bad")

# Rendered from RATING_NAMES so the validator and the constraint can't drift.
# Must produce the exact string the baseline migration used, or `alembic
# check` would report a spurious constraint change.
RATING_CHECK_SQL = "rating IN ({})".format(",".join(f"'{name}'" for name in RATING_NAMES))

# How many genres one game may carry. Bounds a malformed or vandalized
# Wikipedia article, not a real library — nothing legitimately lists more than a
# handful.
#
# Imported by both the create schemas (as Field(max_length=...)) and
# services/genres.py, so the cap is one number. Keep it that way: Pydantic
# applies max_length before the validator runs, so a second literal here would
# cap HTTP writes at one value and the backfill path at another.
MAX_GENRES = 12

# Per-genre length cap, same one-number reasoning as above: enforced by
# clean_genres for HTTP writes and applied by the add path to the genres it
# sources from Wikipedia, which never pass through a create schema.
MAX_GENRE_LENGTH = 50


class PlayedGame(Base):
    """One row = one game in one user's library."""

    __tablename__ = "played_games"

    id: Mapped[int] = mapped_column(BigInteger, Identity(always=True), primary_key=True)
    user_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("profiles.id", ondelete="CASCADE"))
    # No cascade, deliberately: deleting a catalog row must never silently
    # empty somebody's shelf. A catalog row with link rows cannot be deleted.
    metadata_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("game_metadata.id"))
    # The one console this user played it on. Singular on purpose: a second
    # console for the same game would be a second row, which is why the unique
    # key below is what stops it today. Relaxing that key to include `system`
    # is all it would take to allow it.
    system: Mapped[str] = mapped_column(Text)
    # NULL = unrated; the CHECK only constrains non-NULL values.
    rating: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    __table_args__ = (
        # Final name via the metadata naming convention: ck_played_games_rating.
        CheckConstraint(RATING_CHECK_SQL, name="rating"),
        # One entry per game per user. Replaces the old (user_id, name, system)
        # key, which let the same game appear twice under two consoles.
        UniqueConstraint("user_id", "metadata_id", name="uq_played_games_user_id_metadata_id"),
    )


class PlaySession(Base):
    """A play session; the FK replaces the CSV's join-by-exact-name."""

    __tablename__ = "play_sessions"

    id: Mapped[int] = mapped_column(BigInteger, Identity(always=True), primary_key=True)
    # Points at the USER's library row, never at the catalog: a session is a
    # fact about a person, so a catalog FK would need user_id alongside it and
    # would make "a session for a game not in my library" representable. It is
    # also what lets two catalog rows be merged later without touching a single
    # session.
    #
    # ON DELETE CASCADE: deleting a game takes its play history with it; the
    # delete UI warns with the session count first.
    game_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("played_games.id", ondelete="CASCADE")
    )
    start_date: Mapped[date] = mapped_column(Date)
    # NULL = open session = "currently playing".
    end_date: Mapped[date | None] = mapped_column(Date)

    __table_args__ = (
        # At most one OPEN session per game, enforced by the DB: the service's
        # check-then-insert 409 can race (two concurrent "start playing"
        # requests both pass the check), and this partial index is what makes
        # the invariant real — the loser gets an IntegrityError the service
        # maps back to the same 409. Closed sessions are unconstrained.
        Index(
            "uq_play_sessions_one_open_per_game",
            "game_id",
            unique=True,
            postgresql_where=text("end_date IS NULL"),
        ),
        # Plain (non-partial) index on the same column. The partial one above
        # cannot serve the library read's `game_id IN (...)` or the ON DELETE
        # CASCADE's child lookup, because neither implies "end_date IS NULL" —
        # so both sequentially scanned every user's sessions without this.
        Index("ix_play_sessions_game_id", "game_id"),
    )
