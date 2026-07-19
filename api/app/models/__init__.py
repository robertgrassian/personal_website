"""SQLAlchemy ORM entities mapping the Postgres schema (spec §4.2).
Persistence shapes only — API-facing shapes belong in schemas.

Importing this package registers every table on ``Base.metadata`` — Alembic's
env.py relies on that for autogenerate, so new models must be imported here.
"""

from app.models.base import Base
from app.models.follow import Follow
from app.models.game import Game, PlaySession
from app.models.profile import Profile
from app.models.wishlist_item import WishlistItem

__all__ = ["Base", "Follow", "Game", "PlaySession", "Profile", "WishlistItem"]
