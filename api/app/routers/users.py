"""Public read endpoints for user libraries and profiles (spec §6).

No auth: every route here serves public, cacheable data (spec §7.2). HTTP
concerns only — each handler delegates to the service and maps the domain
``UserNotFoundError`` to a 404 with FastAPI's standard ``{"detail": ...}``
error shape.
"""

from fastapi import APIRouter

from app.core.db import DbSession
from app.schemas.users import GameRead, ProfileRead, UserSummary, WishlistGameRead
from app.services import follows as follows_service
from app.services import users as users_service

router = APIRouter(tags=["users"])


@router.get("/users/{username}/games")
def read_user_games(username: str, db: DbSession) -> list[GameRead]:
    return users_service.get_user_games(db, username)


@router.get("/users/{username}/wishlist")
def read_user_wishlist(username: str, db: DbSession) -> list[WishlistGameRead]:
    return users_service.get_user_wishlist(db, username)


@router.get("/users/{username}/followers")
def read_user_followers(username: str, db: DbSession) -> list[UserSummary]:
    """Who follows this user. Public, like the libraries themselves."""
    return follows_service.get_followers(db, username)


@router.get("/users/{username}/following")
def read_user_following(username: str, db: DbSession) -> list[UserSummary]:
    """Who this user follows."""
    return follows_service.get_following(db, username)


# Declared after the /users/{username}/... routes above. FastAPI matches on the
# full path shape, so this is not actually ambiguous with them — but keeping
# the barest pattern last matches how the collection reads.
@router.get("/users/{username}")
def read_user_profile(username: str, db: DbSession) -> ProfileRead:
    return users_service.get_user_profile(db, username)
