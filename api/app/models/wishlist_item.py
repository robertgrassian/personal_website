"""Wishlist entries (spec §4.2)."""

import uuid
from datetime import date

from sqlalchemy import (
    BigInteger,
    Boolean,
    Date,
    ForeignKey,
    Identity,
    Integer,
    Text,
    UniqueConstraint,
    Uuid,
    text,
)
from sqlalchemy.dialects.postgresql import ARRAY
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class WishlistItem(Base):
    __tablename__ = "wishlist_items"

    id: Mapped[int] = mapped_column(BigInteger, Identity(always=True), primary_key=True)
    user_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("profiles.id", ondelete="CASCADE")
    )
    name: Mapped[str] = mapped_column(Text)
    # Unlike games.system, nullable: a wishlist entry may predate deciding
    # which platform to buy it on.
    system: Mapped[str | None] = mapped_column(Text)
    genres: Mapped[list[str]] = mapped_column(ARRAY(Text), server_default=text("'{}'::text[]"))
    release_date: Mapped[date | None] = mapped_column(Date)
    image_url: Mapped[str | None] = mapped_column(Text)
    igdb_id: Mapped[int | None] = mapped_column(Integer)
    starred: Mapped[bool] = mapped_column(Boolean, server_default=text("false"))
    date_added: Mapped[date] = mapped_column(Date, server_default=text("CURRENT_DATE"))
    notes: Mapped[str] = mapped_column(Text, server_default=text("''"))

    # Wishlist dedupe is by name alone — no system in the key, unlike games.
    __table_args__ = (UniqueConstraint("user_id", "name", name="uq_wishlist_items_user_id_name"),)
