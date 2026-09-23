"""SQLAlchemy ORM entities mapping the Postgres schema.
Persistence shapes only — API-facing shapes belong in schemas.

Importing this package registers every table on ``Base.metadata`` — Alembic's
env.py relies on that for autogenerate, so new models must be imported here.
"""

from app.models.base import Base
from app.models.follow import Follow
from app.models.game import PlayedGame, PlaySession
from app.models.game_metadata import GameMetadata
from app.models.game_note import GameNote
from app.models.igdb import IgdbToken, RateLimit
from app.models.profile import Profile
from app.models.wishlist_game import WishlistGame

__all__ = [
    "Base",
    "Follow",
    "GameMetadata",
    "GameNote",
    "IgdbToken",
    "PlaySession",
    "PlayedGame",
    "Profile",
    "RateLimit",
    "WishlistGame",
]
