"""Serverless-shared state backing the IGDB proxy.

Both tables exist because in-process state dies with every serverless
instance: the Twitch app token would be re-minted on each cold start and an
in-memory rate limiter would count each instance separately. Postgres is the
one place all instances share.
"""

import uuid
from datetime import datetime

from sqlalchemy import CheckConstraint, DateTime, Integer, Text, Uuid
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class IgdbToken(Base):
    """The Twitch client-credentials token IGDB requires — a singleton row.

    The CHECK pins ``id`` to 1 so upserts always target the same row and the
    table can never grow. Concurrent refreshes are benign: Twitch keeps
    previously issued tokens valid until expiry, so last-write-wins costs
    nothing.
    """

    __tablename__ = "igdb_tokens"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    access_token: Mapped[str] = mapped_column(Text)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))

    __table_args__ = (
        # Final name via the metadata naming convention: ck_igdb_tokens_singleton.
        CheckConstraint("id = 1", name="singleton"),
    )


class RateLimit(Base):
    """Fixed-window request counter, one row per (user, bucket).

    ``bucket`` names the limited action ("igdb_search" today; write-endpoint
    buckets can join later without a schema change). Rows are upserted in
    place — the window either resets or increments — so the table stays
    bounded at users x buckets.

    ``user_id`` is the verified auth id from the JWT, deliberately without an
    FK to profiles: rate limiting must also cover authenticated callers who
    haven't finished onboarding.
    """

    __tablename__ = "rate_limits"

    user_id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True)
    bucket: Mapped[str] = mapped_column(Text, primary_key=True)
    window_start: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    count: Mapped[int] = mapped_column(Integer)
