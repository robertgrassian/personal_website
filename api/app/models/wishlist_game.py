"""A user's wishlist entries.

Same split as played_games: the game itself lives once in game_metadata, and
this table carries only the per-user facts (starred, notes, when it was added,
and which platform they mean to buy it on).
"""

import uuid
from datetime import date

from sqlalchemy import (
    BigInteger,
    Boolean,
    Date,
    ForeignKey,
    Identity,
    Text,
    UniqueConstraint,
    Uuid,
    text,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class WishlistGame(Base):
    __tablename__ = "wishlist_games"

    id: Mapped[int] = mapped_column(BigInteger, Identity(always=True), primary_key=True)
    user_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("profiles.id", ondelete="CASCADE"))
    # No cascade, for the same reason as played_games.metadata_id.
    metadata_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("game_metadata.id"))
    # Unlike played_games.system, nullable: a wishlist entry may predate
    # deciding which platform to buy it on.
    system: Mapped[str | None] = mapped_column(Text)
    starred: Mapped[bool] = mapped_column(Boolean, server_default=text("false"))
    date_added: Mapped[date] = mapped_column(Date, server_default=text("CURRENT_DATE"))
    notes: Mapped[str] = mapped_column(Text, server_default=text("''"))

    # One wishlist entry per game per user. The old key was (user_id, name);
    # this says the same thing now that the name lives in the catalog.
    __table_args__ = (
        UniqueConstraint("user_id", "metadata_id", name="uq_wishlist_games_user_id_metadata_id"),
    )
