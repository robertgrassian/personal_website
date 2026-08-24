"""A user's free-text notes on one game in their library.

Its own table rather than a column on played_games, for two reasons. The
library read selects whole PlayedGame entities (repositories/users.py), so a
column here would load every note on every read of a page that never shows one.
And the unique constraint below is the "one blob per game" decision made
reversible: growing this into timestamped journal entries is dropping that
constraint and adding created_at, not a data migration.
"""

from datetime import datetime

from sqlalchemy import (
    BigInteger,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Identity,
    Text,
    UniqueConstraint,
    func,
    text,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base

# Per-note character cap. Long enough for a real playthrough journal (~3,500
# words) and far past the 1,000 that wishlist notes get, which are a label
# rather than a document.
#
# One number, imported by the schema as Field(max_length=...) and rendered into
# the CHECK below, for the same reason MAX_GENRES is: Pydantic applies
# max_length before any validator runs, so a second literal would cap HTTP
# writes at one value and the constraint at another.
MAX_NOTE_LENGTH = 20_000

# Rendered from the constant so the two cannot drift. char_length, not
# octet_length: Pydantic counts characters, so the backstop must too or a note
# of multi-byte characters would pass validation and fail the insert.
NOTE_LENGTH_CHECK_SQL = f"char_length(body) <= {MAX_NOTE_LENGTH}"


class GameNote(Base):
    """One row = the notes on one game in one user's library."""

    __tablename__ = "game_notes"

    id: Mapped[int] = mapped_column(BigInteger, Identity(always=True), primary_key=True)
    # Points at the user's library row, never at the catalog — same reasoning as
    # PlaySession.game_id: a note is a fact about a person, and the FK is what
    # makes "a note for a game not in my library" unrepresentable.
    #
    # ON DELETE CASCADE: deleting a game takes its notes with it, as it already
    # does its sessions.
    game_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("played_games.id", ondelete="CASCADE")
    )
    body: Mapped[str] = mapped_column(Text, server_default=text("''"))
    # Set by the service on every write, not by the DB: Postgres has no ON
    # UPDATE trigger here, and the UI shows this value ("Edited Aug 24"), so a
    # stale one would be a visible lie rather than a missing default.
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    __table_args__ = (
        # One note per game. Also what makes the FK an implicit index, so the
        # cascade's child lookup is not a sequential scan.
        UniqueConstraint("game_id", name="uq_game_notes_game_id"),
        # Final name via the naming convention: ck_game_notes_body_length.
        CheckConstraint(NOTE_LENGTH_CHECK_SQL, name="body_length"),
    )
