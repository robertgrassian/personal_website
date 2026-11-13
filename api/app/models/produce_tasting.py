"""One produce item a user has eaten in one calendar year.

The produce tracker's only table. It keys on the auth user, not on profiles: a
game-library profile means a username, a public library and one of MAX_USERS
slots, and none of that is needed to tick off a strawberry.
"""

import uuid
from datetime import date, datetime

from sqlalchemy import CheckConstraint, Date, DateTime, SmallInteger, Text, Uuid, func
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base

# Imported by the router as the path parameter's pattern and rendered into the
# CHECK below, so HTTP validation and the constraint cannot drift. The MIGRATION
# spells its own copy out; see the note in game_notes' migration for why.
SLUG_PATTERN = r"^[a-z0-9]+(-[a-z0-9]+)*$"
MAX_SLUG_LENGTH = 64

# No tasting predates the feature by years. A floor turns a typo'd year into a
# refusal instead of a row no page will ever show.
EARLIEST_EATEN_ON = date(2020, 1, 1)

# Per-user ceiling across all years. The slug is free text (the catalog is a TS
# module this API cannot read) and writing needs only a Google account, so
# without this one user could fill the table. A whole catalog every year for a
# decade fits.
MAX_TASTINGS_PER_USER = 1000

SLUG_CHECK_SQL = (
    f"produce_slug ~ '{SLUG_PATTERN}' AND char_length(produce_slug) <= {MAX_SLUG_LENGTH}"
)
YEAR_CHECK_SQL = "year = extract(year from eaten_on)"
EATEN_ON_CHECK_SQL = f"eaten_on >= DATE '{EARLIEST_EATEN_ON.isoformat()}'"


class ProduceTasting(Base):
    """One row = one user ate one item at least once in one year."""

    __tablename__ = "produce_tastings"

    # REFERENCES auth.users(id) ON DELETE CASCADE, in the migration only, for
    # the reason given on Profile.id: auth.users belongs to GoTrue and stays out
    # of this metadata. Deleting the account is what deletes these rows.
    user_id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True)
    # The catalog's slug (src/lib/produce/catalog.ts). Not validated against the
    # catalog: an unknown slug in a private log harms nothing, and the client
    # ignores slugs it does not know.
    produce_slug: Mapped[str] = mapped_column(Text, primary_key=True)
    # Redundant with eaten_on on purpose: it is what makes "once per year" a
    # primary key rather than an expression index.
    year: Mapped[int] = mapped_column(SmallInteger, primary_key=True)
    # Sent by the client. The server cannot default it: "today" depends on the
    # caller's region, and UTC is already January 1 at 8pm on December 31 in
    # New York, which would file the tasting under the wrong year.
    eaten_on: Mapped[date] = mapped_column(Date)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    __table_args__ = (
        # Final names via the naming convention: ck_produce_tastings_<name>.
        CheckConstraint(SLUG_CHECK_SQL, name="slug_format"),
        CheckConstraint(YEAR_CHECK_SQL, name="year_matches_eaten_on"),
        CheckConstraint(EATEN_ON_CHECK_SQL, name="eaten_on_floor"),
    )
