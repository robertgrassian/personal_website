"""Directed follow edge: follower → followee (spec §4.2)."""

import uuid
from datetime import datetime

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, Uuid, func
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class Follow(Base):
    __tablename__ = "follows"

    # Composite PK: one edge per (follower, followee) pair, so duplicate
    # follows are impossible at the DB level.
    follower_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("profiles.id", ondelete="CASCADE"), primary_key=True
    )
    followee_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("profiles.id", ondelete="CASCADE"), primary_key=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    __table_args__ = (
        # Final name via the metadata naming convention: ck_follows_no_self_follow.
        CheckConstraint("follower_id <> followee_id", name="no_self_follow"),
    )
