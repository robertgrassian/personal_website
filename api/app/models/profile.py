"""App-level user profile (spec §4.2)."""

import uuid
from datetime import datetime

from sqlalchemy import CheckConstraint, DateTime, Index, Text, Uuid, func
from sqlalchemy.dialects.postgresql import CITEXT
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base

# URL-safe handle: starts with a lowercase letter or digit, then letters,
# digits, underscore, or hyphen; 3-30 chars total. The ::text cast matters —
# citext overloads `~` to match case-insensitively, which would let uppercase
# usernames through the lowercase-only charset.
USERNAME_CHECK_SQL = r"username::text ~ '^[a-z0-9][a-z0-9_-]{2,29}$'"


class Profile(Base):
    __tablename__ = "profiles"

    # Spec declares this as REFERENCES auth.users(id) ON DELETE CASCADE, but
    # the FK is deliberately NOT declared in this phase: Phase 1 seeds a
    # placeholder Robert profile with no corresponding auth user, which the
    # FK would reject. A Phase 2 migration adds the constraint after the seed
    # data is re-parented to Robert's real auth.users row.
    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True)
    # citext: /u/Robert and /u/robert resolve to the same row (unique
    # comparisons are case-insensitive).
    username: Mapped[str] = mapped_column(CITEXT, unique=True)
    display_name: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    __table_args__ = (
        # Final name via the metadata naming convention: ck_profiles_username_format.
        CheckConstraint(USERNAME_CHECK_SQL, name="username_format"),
        # pg_trgm GIN indexes back the fuzzy /users/search endpoint (spec
        # §4.2). gin_trgm_ops accepts the citext column directly (citext is
        # binary-coercible to text).
        Index(
            "ix_profiles_username_trgm",
            "username",
            postgresql_using="gin",
            postgresql_ops={"username": "gin_trgm_ops"},
        ),
        Index(
            "ix_profiles_display_name_trgm",
            "display_name",
            postgresql_using="gin",
            postgresql_ops={"display_name": "gin_trgm_ops"},
        ),
    )
